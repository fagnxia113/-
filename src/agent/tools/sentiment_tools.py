# -*- coding: utf-8 -*-
"""
Sentiment tools — A-share market sentiment data as agent-callable tools.

Tools:
- get_stock_sentiment: aggregate sentiment from guba (股吧) + hot rankings
- get_valuation_percentile: PE/PB historical percentile and industry comparison
- get_financial_deep_analysis: three statements + financial ratios + DuPont analysis
"""

import logging
from typing import Any, Dict, List, Optional

from src.agent.tools.registry import ToolParameter, ToolDefinition

logger = logging.getLogger(__name__)


def _get_akshare():
    try:
        import akshare as ak
        return ak
    except ImportError:
        return None


# ============================================================
# get_stock_sentiment
# ============================================================

def _handle_get_stock_sentiment(stock_code: str) -> dict:
    """Aggregate A-share sentiment from guba posts + hot rankings."""
    ak = _get_akshare()
    if ak is None:
        return {"stock_code": stock_code, "status": "error", "error": "akshare not installed"}

    result = {
        "stock_code": stock_code,
        "guba_sentiment": None,
        "hot_rank": None,
        "overall_sentiment": "neutral",
    }

    try:
        guba_df = ak.stock_guba_sina(symbol=stock_code, page=1)
        if guba_df is not None and not guba_df.empty:
            posts = []
            for _, row in guba_df.head(10).iterrows():
                posts.append({
                    "title": str(row.get("title", "")),
                    "content": str(row.get("content", ""))[:200],
                    "created_at": str(row.get("created_at", "")),
                })
            result["guba_sentiment"] = {
                "post_count": len(guba_df),
                "recent_posts": posts,
            }
    except Exception as exc:
        logger.warning("get_stock_sentiment guba failed for %s: %s", stock_code, exc)
        result["guba_sentiment"] = {"error": str(exc)}

    try:
        hot_df = ak.stock_hot_rank_em()
        if hot_df is not None and not hot_df.empty:
            stock_hot = hot_df[hot_df["股票代码"] == stock_code]
            if not stock_hot.empty:
                row = stock_hot.iloc[0]
                result["hot_rank"] = {
                    "rank": int(row.get("序号", 0)),
                    "hot_score": str(row.get("热度值", "")),
                }
    except Exception as exc:
        logger.warning("get_stock_sentiment hot_rank failed for %s: %s", stock_code, exc)
        result["hot_rank"] = {"error": str(exc)}

    has_guba = result["guba_sentiment"] and "error" not in (result["guba_sentiment"] or {})
    has_hot = result["hot_rank"] and "error" not in (result["hot_rank"] or {})
    result["status"] = "ok" if (has_guba or has_hot) else "partial"

    return result


get_stock_sentiment_tool = ToolDefinition(
    name="get_stock_sentiment",
    description="Get A-share market sentiment data: guba (股吧) discussion posts and hot stock rankings. "
                "Useful for gauging retail investor sentiment and attention level. A-share only.",
    parameters=[
        ToolParameter(
            name="stock_code",
            type="string",
            description="A-share stock code, e.g., '600519'",
        ),
    ],
    handler=_handle_get_stock_sentiment,
    category="data",
)


# ============================================================
# get_valuation_percentile
# ============================================================

def _handle_get_valuation_percentile(stock_code: str) -> dict:
    """PE/PB historical percentile and industry comparison."""
    ak = _get_akshare()
    if ak is None:
        return {"stock_code": stock_code, "status": "error", "error": "akshare not installed"}

    result = {
        "stock_code": stock_code,
        "pe_percentile": None,
        "pb_percentile": None,
        "status": "partial",
    }

    try:
        pe_df = ak.stock_zh_valuation_baidu(symbol=stock_code, indicator="市盈率(TTM)", period="近一年")
        if pe_df is not None and not pe_df.empty:
            values = pe_df["value"].dropna()
            if len(values) > 0:
                latest = float(values.iloc[-1])
                result["pe_percentile"] = {
                    "latest": round(latest, 2),
                    "p25": round(float(values.quantile(0.25)), 2),
                    "p50": round(float(values.quantile(0.50)), 2),
                    "p75": round(float(values.quantile(0.75)), 2),
                    "min": round(float(values.min()), 2),
                    "max": round(float(values.max()), 2),
                    "percentile_rank": round(float((values < latest).sum() / len(values) * 100), 1),
                }
    except Exception as exc:
        logger.warning("get_valuation_percentile PE failed for %s: %s", stock_code, exc)

    try:
        pb_df = ak.stock_zh_valuation_baidu(symbol=stock_code, indicator="市净率", period="近一年")
        if pb_df is not None and not pb_df.empty:
            values = pb_df["value"].dropna()
            if len(values) > 0:
                latest = float(values.iloc[-1])
                result["pb_percentile"] = {
                    "latest": round(latest, 2),
                    "p25": round(float(values.quantile(0.25)), 2),
                    "p50": round(float(values.quantile(0.50)), 2),
                    "p75": round(float(values.quantile(0.75)), 2),
                    "min": round(float(values.min()), 2),
                    "max": round(float(values.max()), 2),
                    "percentile_rank": round(float((values < latest).sum() / len(values) * 100), 1),
                }
    except Exception as exc:
        logger.warning("get_valuation_percentile PB failed for %s: %s", stock_code, exc)

    if result["pe_percentile"] or result["pb_percentile"]:
        result["status"] = "ok"

    return result


get_valuation_percentile_tool = ToolDefinition(
    name="get_valuation_percentile",
    description="Get PE/PB historical percentile analysis for a stock. Returns 1-year percentile "
                "rank, quartiles, and min/max. Helps determine if current valuation is expensive "
                "or cheap relative to history. A-share only.",
    parameters=[
        ToolParameter(
            name="stock_code",
            type="string",
            description="A-share stock code, e.g., '600519'",
        ),
    ],
    handler=_handle_get_valuation_percentile,
    category="data",
)


# ============================================================
# get_financial_deep_analysis
# ============================================================

def _handle_get_financial_deep_analysis(stock_code: str) -> dict:
    """Three financial statements + financial ratios + DuPont analysis."""
    ak = _get_akshare()
    if ak is None:
        return {"stock_code": stock_code, "status": "error", "error": "akshare not installed"}

    result = {
        "stock_code": stock_code,
        "balance_sheet": None,
        "income_statement": None,
        "cash_flow": None,
        "financial_ratios": None,
        "dupont_analysis": None,
        "status": "partial",
    }

    try:
        bs_df = ak.stock_financial_abstract_ths(symbol=stock_code, indicator="资产负债表")
        if bs_df is not None and not bs_df.empty:
            result["balance_sheet"] = bs_df.head(4).to_dict("records")
    except Exception as exc:
        logger.warning("get_financial_deep_analysis balance_sheet failed for %s: %s", stock_code, exc)

    try:
        is_df = ak.stock_financial_abstract_ths(symbol=stock_code, indicator="利润表")
        if is_df is not None and not is_df.empty:
            result["income_statement"] = is_df.head(4).to_dict("records")
    except Exception as exc:
        logger.warning("get_financial_deep_analysis income_statement failed for %s: %s", stock_code, exc)

    try:
        cf_df = ak.stock_financial_abstract_ths(symbol=stock_code, indicator="现金流量表")
        if cf_df is not None and not cf_df.empty:
            result["cash_flow"] = cf_df.head(4).to_dict("records")
    except Exception as exc:
        logger.warning("get_financial_deep_analysis cash_flow failed for %s: %s", stock_code, exc)

    try:
        fi_df = ak.stock_financial_analysis_indicator(symbol=stock_code)
        if fi_df is not None and not fi_df.empty:
            latest = fi_df.iloc[0]
            roe = latest.get("净资产收益率", None)
            net_profit_margin = latest.get("销售净利率", None)
            asset_turnover = latest.get("总资产周转率", None)
            equity_multiplier = latest.get("权益乘数", None)

            result["financial_ratios"] = {
                "report_date": str(latest.get("报告期", "")),
                "roe": roe,
                "roa": latest.get("总资产收益率", None),
                "gross_margin": latest.get("销售毛利率", None),
                "net_margin": net_profit_margin,
                "debt_ratio": latest.get("资产负债率", None),
                "current_ratio": latest.get("流动比率", None),
                "quick_ratio": latest.get("速动比率", None),
                "revenue_yoy": latest.get("营业收入同比增长", None),
                "profit_yoy": latest.get("净利润同比增长", None),
                "inventory_turnover": latest.get("存货周转率", None),
                "receivable_turnover": latest.get("应收账款周转率", None),
            }

            try:
                roe_val = float(roe) if roe else None
                npm_val = float(net_profit_margin) if net_profit_margin else None
                at_val = float(asset_turnover) if asset_turnover else None
                em_val = float(equity_multiplier) if equity_multiplier else None

                if all(v is not None for v in [roe_val, npm_val, at_val, em_val]):
                    result["dupont_analysis"] = {
                        "roe": round(roe_val, 4),
                        "net_profit_margin": round(npm_val, 4),
                        "asset_turnover": round(at_val, 4),
                        "equity_multiplier": round(em_val, 4),
                        "decomposition_check": round(npm_val * at_val * em_val, 4),
                        "interpretation": _interpret_dupont(npm_val, at_val, em_val),
                    }
            except (TypeError, ValueError):
                pass
    except Exception as exc:
        logger.warning("get_financial_deep_analysis ratios failed for %s: %s", stock_code, exc)

    filled_fields = sum(1 for k in ["balance_sheet", "income_statement", "cash_flow", "financial_ratios"]
                        if result.get(k) is not None)
    if filled_fields >= 2:
        result["status"] = "ok"
    elif filled_fields == 1:
        result["status"] = "partial"

    return result


def _interpret_dupont(npm: float, at: float, em: float) -> str:
    if npm > 0.15 and at > 0.8:
        return "high_margin_high_turnover"
    elif npm > 0.15:
        return "high_margin_low_turnover"
    elif at > 0.8:
        return "low_margin_high_turnover"
    elif em > 3.0:
        return "leverage_driven"
    else:
        return "balanced"


get_financial_deep_analysis_tool = ToolDefinition(
    name="get_financial_deep_analysis",
    description="Get deep financial analysis: balance sheet, income statement, cash flow statement, "
                "financial ratios, and DuPont decomposition (ROE = Net Margin × Asset Turnover × "
                "Equity Multiplier). A-share only.",
    parameters=[
        ToolParameter(
            name="stock_code",
            type="string",
            description="A-share stock code, e.g., '600519'",
        ),
    ],
    handler=_handle_get_financial_deep_analysis,
    category="data",
)


ALL_SENTIMENT_TOOLS = [
    get_stock_sentiment_tool,
    get_valuation_percentile_tool,
    get_financial_deep_analysis_tool,
]
