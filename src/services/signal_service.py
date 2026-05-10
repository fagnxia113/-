# -*- coding: utf-8 -*-
import logging
from typing import Optional, Dict, Any, List
import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)


class SignalService:

    def _load_df(self, stock_code: str, days: int = 120) -> Optional[pd.DataFrame]:
        try:
            from src.services.history_loader import load_history_df
            df, _ = load_history_df(stock_code, days=days)
            return df
        except Exception as e:
            logger.error(f"加载历史数据失败 {stock_code}: {e}")
            return None

    def compute_rps(self, stock_code: str, period: int = 60) -> Dict[str, Any]:
        df = self._load_df(stock_code, days=period + 30)
        if df is None or len(df) < period:
            return {"code": stock_code, "rps": None, "rank_desc": "数据不足"}

        df = df.sort_values('date').tail(period).copy()
        if df.empty:
            return {"code": stock_code, "rps": None, "rank_desc": "数据不足"}

        first_close = df.iloc[0]['close']
        last_close = df.iloc[-1]['close']
        if first_close <= 0:
            return {"code": stock_code, "rps": None, "rank_desc": "数据异常"}

        stock_return = (last_close - first_close) / first_close * 100

        try:
            from data_provider.base import DataFetcherManager
            manager = DataFetcherManager()
            from data_provider.pytdx_fetcher import PytdxFetcher
            fetcher = PytdxFetcher()
            with fetcher._pytdx_session() as api:
                market = 1 if stock_code.startswith(('6', '9', '5')) else 0
                count = api.get_security_count(market)
                all_returns = []
                batch_size = 80
                for start in range(0, min(count, 3000), batch_size):
                    try:
                        items = api.get_security_list(market, start)
                        if not items:
                            break
                        for item in items:
                            c = item.get('code', '')
                            if c.startswith(('6', '0', '3')) and len(c) == 6:
                                all_returns.append(c)
                    except Exception:
                        break

            if stock_code in all_returns:
                all_returns.remove(stock_code)

            sample_size = min(len(all_returns), 200)
            if sample_size > 0:
                import random
                sample_codes = random.sample(all_returns, sample_size)
                sample_returns = []
                for code in sample_codes:
                    try:
                        sdf, _ = manager.get_kline_data(code, period='daily', days=period)
                        if sdf is not None and len(sdf) >= period:
                            sdf = sdf.sort_values('date').tail(period)
                            fc = sdf.iloc[0]['close']
                            lc = sdf.iloc[-1]['close']
                            if fc > 0:
                                sample_returns.append((lc - fc) / fc * 100)
                    except Exception:
                        continue

                if sample_returns:
                    sample_returns.append(stock_return)
                    sorted_returns = sorted(sample_returns, reverse=True)
                    rank = sorted_returns.index(stock_return) + 1
                    rps = round((1 - rank / len(sorted_returns)) * 100, 1)
                else:
                    rps = 50.0
            else:
                rps = 50.0

        except Exception as e:
            logger.warning(f"RPS计算降级 {stock_code}: {e}")
            rps = None

        if rps is not None:
            if rps >= 90:
                rank_desc = "极强"
            elif rps >= 70:
                rank_desc = "强势"
            elif rps >= 50:
                rank_desc = "中性偏强"
            elif rps >= 30:
                rank_desc = "弱势"
            else:
                rank_desc = "极弱"
        else:
            rank_desc = "计算失败"

        return {
            "code": stock_code,
            "rps": rps,
            "period_return": round(stock_return, 2),
            "rank_desc": rank_desc,
            "period_days": period,
        }

    def detect_divergence(self, stock_code: str) -> Dict[str, Any]:
        df = self._load_df(stock_code, days=120)
        if df is None or len(df) < 30:
            return {"code": stock_code, "signals": [], "summary": "数据不足"}

        df = df.sort_values('date').reset_index(drop=True)
        close = df['close'].values
        high = df['high'].values
        low = df['low'].values
        volume = df['volume'].values.astype(float)

        ema12 = pd.Series(close).ewm(span=12, adjust=False).mean().values
        ema26 = pd.Series(close).ewm(span=26, adjust=False).mean().values
        dif = ema12 - ema26
        dea = pd.Series(dif).ewm(span=9, adjust=False).mean().values
        macd_hist = 2 * (dif - dea)

        signals = []

        window = 30
        if len(close) >= window:
            recent_high_idx = len(close) - 1 - np.argmax(high[-window:])
            prev_high_idx = recent_high_idx
            for i in range(recent_high_idx - 1, max(0, recent_high_idx - window)):
                if high[i] > high[prev_high_idx]:
                    prev_high_idx = i

            if prev_high_idx < recent_high_idx and high[recent_high_idx] > high[prev_high_idx]:
                if dif[recent_high_idx] < dif[prev_high_idx]:
                    vol_recent = np.mean(volume[max(0, recent_high_idx - 3):recent_high_idx + 1])
                    vol_prev = np.mean(volume[max(0, prev_high_idx - 3):prev_high_idx + 1])
                    vol_shrink = vol_prev > 0 and vol_recent < vol_prev * 0.8
                    signals.append({
                        "type": "top_divergence",
                        "name": "顶背离",
                        "direction": "bearish",
                        "strength": "strong" if vol_shrink else "medium",
                        "description": f"价格创新高但MACD未创新高{'，量能萎缩' if vol_shrink else ''}",
                        "date": str(df.iloc[recent_high_idx]['date']) if recent_high_idx < len(df) else "",
                    })

        if len(close) >= window:
            recent_low_idx = len(close) - 1 - np.argmin(low[-window:])
            prev_low_idx = recent_low_idx
            for i in range(recent_low_idx - 1, max(0, recent_low_idx - window)):
                if low[i] < low[prev_low_idx]:
                    prev_low_idx = i

            if prev_low_idx < recent_low_idx and low[recent_low_idx] < low[prev_low_idx]:
                if dif[recent_low_idx] > dif[prev_low_idx]:
                    vol_recent = np.mean(volume[max(0, recent_low_idx - 3):recent_low_idx + 1])
                    vol_prev = np.mean(volume[max(0, prev_low_idx - 3):prev_low_idx + 1])
                    vol_expand = vol_prev > 0 and vol_recent > vol_prev * 1.2
                    signals.append({
                        "type": "bottom_divergence",
                        "name": "底背离",
                        "direction": "bullish",
                        "strength": "strong" if vol_expand else "medium",
                        "description": f"价格创新低但MACD未创新低{'，放量确认' if vol_expand else ''}",
                        "date": str(df.iloc[recent_low_idx]['date']) if recent_low_idx < len(df) else "",
                    })

        if len(close) >= 20:
            vol_ma5 = np.mean(volume[-5:])
            vol_ma20 = np.mean(volume[-20:])
            price_up = close[-1] > close[-6]
            if vol_ma5 > vol_ma20 * 1.5 and price_up:
                signals.append({
                    "type": "volume_breakout",
                    "name": "放量突破",
                    "direction": "bullish",
                    "strength": "strong" if vol_ma5 > vol_ma20 * 2 else "medium",
                    "description": f"5日均量是20日均量的{vol_ma5/vol_ma20:.1f}倍，配合价格上涨",
                    "date": str(df.iloc[-1]['date']),
                })
            elif vol_ma5 < vol_ma20 * 0.5 and close[-1] > close[-6]:
                signals.append({
                    "type": "volume_shrink_up",
                    "name": "缩量上涨",
                    "direction": "bearish",
                    "strength": "weak",
                    "description": "价格上涨但成交量萎缩，上涨动能不足",
                    "date": str(df.iloc[-1]['date']),
                })

        summary_parts = []
        bull = [s for s in signals if s["direction"] == "bullish"]
        bear = [s for s in signals if s["direction"] == "bearish"]
        if bull:
            summary_parts.append(f"看多信号{len(bull)}个: " + "、".join(s["name"] for s in bull))
        if bear:
            summary_parts.append(f"看空信号{len(bear)}个: " + "、".join(s["name"] for s in bear))
        summary = "；".join(summary_parts) if summary_parts else "暂无明显量价背离信号"

        return {
            "code": stock_code,
            "signals": signals,
            "bull_count": len(bull),
            "bear_count": len(bear),
            "summary": summary,
        }

    def compute_resonance(self, stock_code: str) -> Dict[str, Any]:
        df = self._load_df(stock_code, days=120)
        if df is None or len(df) < 60:
            return {"code": stock_code, "score": 0, "signals": [], "summary": "数据不足"}

        df = df.sort_values('date').reset_index(drop=True)
        close = df['close'].values.astype(float)
        volume = df['volume'].values.astype(float)
        high = df['high'].values.astype(float) if 'high' in df.columns else close
        low = df['low'].values.astype(float) if 'low' in df.columns else close
        n = len(close)

        signals = []
        score = 0

        ma5 = np.convolve(close, np.ones(5) / 5, mode='valid')
        ma10 = np.convolve(close, np.ones(10) / 10, mode='valid')
        ma20 = np.convolve(close, np.ones(20) / 20, mode='valid')

        offset5 = n - len(ma5)
        offset10 = n - len(ma10)
        offset20 = n - len(ma20)

        if ma5[-1] > ma10[-1] > ma20[-1]:
            signals.append({"name": "均线多头排列", "direction": "bullish", "weight": 20})
            score += 20
        elif ma5[-1] < ma10[-1] < ma20[-1]:
            signals.append({"name": "均线空头排列", "direction": "bearish", "weight": -20})
            score -= 20

        ema12 = pd.Series(close).ewm(span=12, adjust=False).mean().values
        ema26 = pd.Series(close).ewm(span=26, adjust=False).mean().values
        dif = ema12 - ema26
        dea = pd.Series(dif).ewm(span=9, adjust=False).mean().values

        if len(dif) >= 2 and dif[-1] > dea[-1] and dif[-2] <= dea[-2]:
            signals.append({"name": "MACD金叉", "direction": "bullish", "weight": 15})
            score += 15
        elif len(dif) >= 2 and dif[-1] < dea[-1] and dif[-2] >= dea[-2]:
            signals.append({"name": "MACD死叉", "direction": "bearish", "weight": -15})
            score -= 15
        elif len(dif) >= 1 and dif[-1] > dea[-1] and dif[-1] > 0:
            signals.append({"name": "MACD多头运行", "direction": "bullish", "weight": 10})
            score += 10
        elif len(dif) >= 1 and dif[-1] < dea[-1] and dif[-1] < 0:
            signals.append({"name": "MACD空头运行", "direction": "bearish", "weight": -10})
            score -= 10

        if n >= 5:
            vol_ma5 = np.mean(volume[-5:])
            vol_ma20 = np.mean(volume[-20:]) if n >= 20 else np.mean(volume)
            if vol_ma20 > 0:
                vr = vol_ma5 / vol_ma20
                if vr > 2.0 and close[-1] > close[-2]:
                    signals.append({"name": f"放量上涨(量比{vr:.1f})", "direction": "bullish", "weight": 15})
                    score += 15
                elif vr > 1.5 and close[-1] > close[-2]:
                    signals.append({"name": f"温和放量(量比{vr:.1f})", "direction": "bullish", "weight": 10})
                    score += 10
                elif vr < 0.5:
                    signals.append({"name": f"缩量(量比{vr:.1f})", "direction": "bearish", "weight": -5})
                    score -= 5

        if close[-1] > ma5[-1]:
            signals.append({"name": "站上5日均线", "direction": "bullish", "weight": 5})
            score += 5
        else:
            signals.append({"name": "跌破5日均线", "direction": "bearish", "weight": -5})
            score -= 5

        if n >= 20:
            high20 = np.max(high[-20:])
            low20 = np.min(low[-20:])
            if high20 > low20 and high20 > 0:
                pos = (close[-1] - low20) / (high20 - low20) * 100
                if pos > 80:
                    signals.append({"name": f"20日高位({pos:.0f}%)", "direction": "bearish", "weight": -10})
                    score -= 10
                elif pos < 20:
                    signals.append({"name": f"20日低位({pos:.0f}%)", "direction": "bullish", "weight": 10})
                    score += 10

        score = max(-100, min(100, score))

        if score >= 40:
            level = "强烈看多"
        elif score >= 20:
            level = "偏多"
        elif score > -20:
            level = "中性"
        elif score > -40:
            level = "偏空"
        else:
            level = "强烈看空"

        return {
            "code": stock_code,
            "score": score,
            "level": level,
            "signals": signals,
            "bull_count": len([s for s in signals if s["direction"] == "bullish"]),
            "bear_count": len([s for s in signals if s["direction"] == "bearish"]),
        }

    def get_backtest_summary(self, stock_code: str) -> Dict[str, Any]:
        try:
            from src.services.backtest_service import BacktestService
            svc = BacktestService()
            summary = svc.get_summary(scope="stock", code=stock_code, eval_window_days=10)
            if summary is None:
                return {"code": stock_code, "has_data": False, "summary": None, "recent": []}

            recent = svc.get_recent_evaluations(code=stock_code, eval_window_days=10, limit=5)
            items = recent.get("items", [])

            return {
                "code": stock_code,
                "has_data": True,
                "summary": {
                    "total_evaluations": summary.get("total_evaluations", 0),
                    "direction_accuracy_pct": summary.get("direction_accuracy_pct"),
                    "win_rate_pct": summary.get("win_rate_pct"),
                    "avg_simulated_return_pct": summary.get("avg_simulated_return_pct"),
                },
                "recent": [
                    {
                        "analysis_date": item.get("analysis_date"),
                        "operation_advice": item.get("operation_advice"),
                        "direction_correct": item.get("direction_correct"),
                        "stock_return_pct": item.get("stock_return_pct"),
                        "simulated_return_pct": item.get("simulated_return_pct"),
                    }
                    for item in items
                ],
            }
        except Exception as e:
            logger.error(f"获取回测摘要失败 {stock_code}: {e}")
            return {"code": stock_code, "has_data": False, "summary": None, "recent": []}
