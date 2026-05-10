# -*- coding: utf-8 -*-
"""
===================================
股票数据服务层
===================================

职责：
1. 封装股票数据获取逻辑
2. 提供实时行情和历史数据接口
"""

import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

from src.repositories.stock_repo import StockRepository

logger = logging.getLogger(__name__)


class StockService:
    """
    股票数据服务
    
    封装股票数据获取的业务逻辑
    """
    
    def __init__(self):
        """初始化股票数据服务"""
        self.repo = StockRepository()
    
    def get_realtime_quote(self, stock_code: str) -> Optional[Dict[str, Any]]:
        """
        获取股票实时行情
        
        Args:
            stock_code: 股票代码
            
        Returns:
            实时行情数据字典
        """
        try:
            # 调用数据获取器获取实时行情
            from data_provider.base import DataFetcherManager
            
            manager = DataFetcherManager()
            quote = manager.get_realtime_quote(stock_code)
            
            if quote is None:
                logger.warning(f"获取 {stock_code} 实时行情失败")
                return None
            
            # UnifiedRealtimeQuote 是 dataclass，使用 getattr 安全访问字段
            # 字段映射: UnifiedRealtimeQuote -> API 响应
            # - code -> stock_code
            # - name -> stock_name
            # - price -> current_price
            # - change_amount -> change
            # - change_pct -> change_percent
            # - open_price -> open
            # - high -> high
            # - low -> low
            # - pre_close -> prev_close
            # - volume -> volume
            # - amount -> amount
            return {
                "stock_code": getattr(quote, "code", stock_code),
                "stock_name": getattr(quote, "name", None),
                "current_price": getattr(quote, "price", 0.0) or 0.0,
                "change": getattr(quote, "change_amount", None),
                "change_percent": getattr(quote, "change_pct", None),
                "open": getattr(quote, "open_price", None),
                "high": getattr(quote, "high", None),
                "low": getattr(quote, "low", None),
                "prev_close": getattr(quote, "pre_close", None),
                "volume": getattr(quote, "volume", None),
                "amount": getattr(quote, "amount", None),
                "volume_ratio": getattr(quote, "volume_ratio", None),
                "turnover_rate": getattr(quote, "turnover_rate", None),
                "amplitude": getattr(quote, "amplitude", None),
                "pe_ratio": getattr(quote, "pe_ratio", None),
                "pb_ratio": getattr(quote, "pb_ratio", None),
                "total_mv": getattr(quote, "total_mv", None),
                "circ_mv": getattr(quote, "circ_mv", None),
                "high_52w": getattr(quote, "high_52w", None),
                "low_52w": getattr(quote, "low_52w", None),
                "update_time": datetime.now().isoformat(),
            }
            
        except ImportError:
            logger.warning("DataFetcherManager 未找到，使用占位数据")
            return self._get_placeholder_quote(stock_code)
        except Exception as e:
            logger.error(f"获取实时行情失败: {e}", exc_info=True)
            return None
    
    INTRADAY_PERIODS = {'1min', '5min', '15min', '30min', '60min'}
    INTRADAY_BARS_PER_DAY = {
        '1min': 240,
        '5min': 48,
        '15min': 16,
        '30min': 8,
        '60min': 4,
    }

    def get_history_data(
        self,
        stock_code: str,
        period: str = "daily",
        days: int = 30
    ) -> Dict[str, Any]:
        valid_periods = {"daily", "weekly", "monthly"} | self.INTRADAY_PERIODS
        if period not in valid_periods:
            raise ValueError(
                f"暂不支持 '{period}' 周期，目前仅支持 'daily'、'weekly'、'monthly'、"
                "'1min'、'5min'、'15min'、'30min'、'60min'。"
            )

        try:
            from data_provider.base import DataFetcherManager
            
            manager = DataFetcherManager()

            if period in self.INTRADAY_PERIODS:
                count = days * self.INTRADAY_BARS_PER_DAY[period]
                df, source = manager.get_intraday_data(stock_code, period=period, count=count)
            elif period in ("daily", "weekly", "monthly"):
                df, source = manager.get_kline_data(stock_code, period=period, days=days)
            else:
                df, source = manager.get_daily_data(stock_code, days=days)
            
            if df is None or df.empty:
                logger.warning(f"获取 {stock_code} 历史数据失败")
                return {"stock_code": stock_code, "period": period, "data": []}
            
            stock_name = manager.get_stock_name(stock_code)

            is_intraday = period in self.INTRADAY_PERIODS
            date_fmt = "%Y-%m-%d %H:%M:%S" if is_intraday else "%Y-%m-%d"

            data = []
            for _, row in df.iterrows():
                date_val = row.get("date")
                if hasattr(date_val, "strftime"):
                    date_str = date_val.strftime(date_fmt)
                else:
                    date_str = str(date_val)
                
                data.append({
                    "date": date_str,
                    "open": float(row.get("open", 0)),
                    "high": float(row.get("high", 0)),
                    "low": float(row.get("low", 0)),
                    "close": float(row.get("close", 0)),
                    "volume": float(row.get("volume", 0)) if row.get("volume") else None,
                    "amount": float(row.get("amount", 0)) if row.get("amount") else None,
                    "change_percent": float(row.get("pct_chg", 0)) if row.get("pct_chg") else None,
                })
            
            return {
                "stock_code": stock_code,
                "stock_name": stock_name,
                "period": period,
                "data": data,
            }
            
        except ImportError:
            logger.warning("DataFetcherManager 未找到，返回空数据")
            return {"stock_code": stock_code, "period": period, "data": []}
        except Exception as e:
            logger.error(f"获取历史数据失败: {e}", exc_info=True)
            return {"stock_code": stock_code, "period": period, "data": []}
    
    def _get_placeholder_quote(self, stock_code: str) -> Dict[str, Any]:
        """
        获取占位行情数据（用于测试）
        
        Args:
            stock_code: 股票代码
            
        Returns:
            占位行情数据
        """
        return {
            "stock_code": stock_code,
            "stock_name": f"股票{stock_code}",
            "current_price": 0.0,
            "change": None,
            "change_percent": None,
            "open": None,
            "high": None,
            "low": None,
            "prev_close": None,
            "volume": None,
            "amount": None,
            "update_time": datetime.now().isoformat(),
        }

    def get_orderbook(self, stock_code: str) -> Optional[Dict[str, Any]]:
        try:
            from data_provider.base import DataFetcherManager
            manager = DataFetcherManager()
            return manager.get_orderbook(stock_code)
        except Exception as e:
            logger.error(f"获取五档盘口失败: {e}", exc_info=True)
            return None

    def get_trade_ticks(self, stock_code: str, count: int = 50) -> Optional[list]:
        try:
            from data_provider.base import DataFetcherManager
            manager = DataFetcherManager()
            return manager.get_trade_ticks(stock_code, count=count)
        except Exception as e:
            logger.error(f"获取成交明细失败: {e}", exc_info=True)
            return None

    INDEX_CODES = {
        '000001': '上证指数',
        '399001': '深证成指',
        '399006': '创业板指',
        '000300': '沪深300',
        '000016': '上证50',
        '000905': '中证500',
    }

    def get_index_quotes(self, codes: list = None) -> list:
        try:
            from data_provider.base import DataFetcherManager
            manager = DataFetcherManager()
            if codes is None:
                codes = list(self.INDEX_CODES.keys())
            results = []
            for code in codes:
                try:
                    df, _source = manager.get_index_bars(code, period='daily', count=2)
                    if df is not None and not df.empty:
                        last = df.iloc[-1]
                        prev = df.iloc[-2] if len(df) > 1 else None
                        price = float(last.get('close', 0))
                        prev_close = float(prev.get('close', 0)) if prev is not None else 0
                        change = round(price - prev_close, 2) if prev_close > 0 else None
                        change_pct = round((change / prev_close) * 100, 2) if prev_close > 0 and change is not None else None
                        results.append({
                            'code': code,
                            'name': self.INDEX_CODES.get(code, ''),
                            'price': price,
                            'change': change,
                            'change_percent': change_pct,
                            'volume': float(last.get('volume', 0)) if last.get('volume') else None,
                            'amount': float(last.get('amount', 0)) if last.get('amount') else None,
                        })
                    else:
                        results.append({'code': code, 'name': self.INDEX_CODES.get(code, ''), 'price': 0})
                except Exception as e:
                    logger.warning(f"获取指数 {code} 行情失败: {e}")
                    results.append({'code': code, 'name': self.INDEX_CODES.get(code, ''), 'price': 0})
            return results
        except Exception as e:
            logger.error(f"获取指数行情失败: {e}", exc_info=True)
            return []

    def get_index_bars(self, index_code: str, period: str = 'daily', count: int = 120) -> dict:
        try:
            from data_provider.base import DataFetcherManager
            manager = DataFetcherManager()
            df, source = manager.get_index_bars(index_code, period=period, count=count)
            if df is None or df.empty:
                return {'code': index_code, 'name': self.INDEX_CODES.get(index_code, ''), 'period': period, 'data': []}
            name = self.INDEX_CODES.get(index_code, '')
            date_fmt = "%Y-%m-%d"
            data = []
            for _, row in df.iterrows():
                date_val = row.get('date')
                date_str = date_val.strftime(date_fmt) if hasattr(date_val, 'strftime') else str(date_val)
                data.append({
                    'date': date_str,
                    'open': float(row.get('open', 0)),
                    'high': float(row.get('high', 0)),
                    'low': float(row.get('low', 0)),
                    'close': float(row.get('close', 0)),
                    'volume': float(row.get('volume', 0)) if row.get('volume') else None,
                    'amount': float(row.get('amount', 0)) if row.get('amount') else None,
                    'change_percent': float(row.get('pct_chg', 0)) if row.get('pct_chg') else None,
                })
            return {'code': index_code, 'name': name, 'period': period, 'data': data}
        except Exception as e:
            logger.error(f"获取指数K线失败: {e}", exc_info=True)
            return {'code': index_code, 'name': self.INDEX_CODES.get(index_code, ''), 'period': period, 'data': []}

    def get_finance_info(self, stock_code: str) -> Optional[dict]:
        try:
            from data_provider.base import DataFetcherManager
            manager = DataFetcherManager()
            result = manager.get_finance_info(stock_code)
            if result is None:
                return None
            quote = manager.get_realtime_quote(stock_code)
            pe = None
            pb = None
            roe = None
            price = getattr(quote, 'price', 0) if quote else 0
            bps = result.get('bps')
            net_profit = result.get('net_profit')
            total_shares = result.get('total_shares')
            net_assets = result.get('net_assets')
            if price and bps and bps > 0:
                pb = round(price / bps, 2)
            if price and net_profit and total_shares and total_shares > 0:
                eps = net_profit / total_shares
                if eps > 0:
                    pe = round(price / eps, 2)
            if net_profit and net_assets and net_assets > 0:
                roe = round((net_profit / net_assets) * 100, 2)
            result['pe_dynamic'] = pe
            result['pb_ratio'] = pb
            result['roe'] = roe
            return result
        except Exception as e:
            logger.error(f"获取财务信息失败: {e}", exc_info=True)
            return None

    def get_xdxr_info(self, stock_code: str) -> Optional[list]:
        try:
            from data_provider.base import DataFetcherManager
            manager = DataFetcherManager()
            return manager.get_xdxr_info(stock_code)
        except Exception as e:
            logger.error(f"获取除权除息失败: {e}", exc_info=True)
            return None
