# -*- coding: utf-8 -*-
"""
Market context detection for LLM prompts.

Detects the market (A-shares, HK, US) from a stock code and returns
market-specific role descriptions so prompts are not hardcoded to a
single market.

Fixes: https://github.com/ZhuLinsen/daily_stock_analysis/issues/644
"""

import re
from typing import Optional


def detect_market(stock_code: Optional[str]) -> str:
    """Detect market from stock code.

    Returns:
        One of 'cn', 'hk', 'us', or 'cn' as fallback.
    """
    if not stock_code:
        return "cn"

    code = stock_code.strip().upper()

    # HK stocks: HK00700, 00700.HK, or 5-digit pure numbers
    if code.startswith("HK") or code.endswith(".HK"):
        return "hk"
    lower = code.lower()
    if lower.endswith(".hk"):
        return "hk"
    # 5-digit pure numbers are HK (A-shares are 6-digit)
    if code.isdigit() and len(code) == 5:
        return "hk"

    # US stocks: 1-5 uppercase letters (AAPL, TSLA, GOOGL)
    # Also handles suffixed forms like BRK.B
    if re.match(r'^[A-Z]{1,5}(\.[A-Z]{1,2})?$', code):
        return "us"

    # Default: A-shares (6-digit numbers like 600519, 000001)
    return "cn"


# -- Market-specific role descriptions --

_MARKET_ROLES = {
    "cn": {
        "zh": " A 股",
        "en": "China A-shares",
    },
    "hk": {
        "zh": "港股",
        "en": "Hong Kong stock",
    },
    "us": {
        "zh": "美股",
        "en": "US stock",
    },
}

_MARKET_GUIDELINES = {
    "cn": {
        "zh": (
            "- 本次分析对象为 **A 股**（中国沪深交易所上市股票）。\n"
            "- 请关注 A 股特有的涨跌停机制（主板±10%、科创板/创业板±20%、ST±5%、北交所±30%）、T+1 交易制度及相关政策因素。\n"
            "\n"
            "## A 股政策与资金分析要点\n"
            "- **政策权重极高**：国务院/证监会/央行/发改委等监管层政策对 A 股影响优先于纯技术面判断。\n"
            "- **关键政策信号**：降准降息、IPO 节奏变化、印花税调整、两融余额变动、国家队入市等。\n"
            "- **行业政策联动**：新能源补贴、AI 产业政策、房地产调控、医药集采等直接影响对应板块估值。\n"
            "- **政策利好辨别**：区分「利好预期→兑现」（可能见光死）与「政策持续催化」（可参与），避免高位接盘。\n"
            "- **板块轮动意识**：A 股板块轮动频繁（通常 3~7 天一轮），需判断个股所在板块处于启动期、发酵期、高潮期还是退潮期。\n"
            "- **涨停板文化**：涨停板是 A 股短线资金的核心博弈场，连板高度、封板率和板块效应是重要情绪指标。"
        ),
        "en": (
            "- This analysis covers a **China A-share** (listed on Shanghai/Shenzhen exchanges).\n"
            "- Consider A-share-specific rules: daily price limits (±10%/±20%/±30%), T+1 settlement, and PRC policy factors.\n"
            "\n"
            "## A-Share Policy & Capital Analysis\n"
            "- **Policy carries outsized weight**: State Council, CSRC, PBOC, and NDRC policy changes should be prioritized over pure technical signals.\n"
            "- **Key policy signals**: RRR/rate cuts, IPO pace changes, stamp duty, margin balance shifts, national team buying.\n"
            "- **Sector policy linkage**: NEV subsidies, AI industrial policy, property controls, pharma procurement directly impact sector valuations.\n"
            "- **Policy catalyst assessment**: Distinguish 'buy the rumor sell the news' from sustained policy catalysts to avoid chasing tops.\n"
            "- **Sector rotation awareness**: A-share sector rotation is rapid (typically 3-7 day cycles). Assess whether the stock's sector is in initiation, acceleration, climax, or retreat phase.\n"
            "- **Limit-up culture**: Limit-up boards are the core battleground for A-share short-term capital. Consecutive limit-up count, seal rate, and sector resonance are key sentiment indicators."
        ),
    },
    "hk": {
        "zh": (
            "- 本次分析对象为 **港股**（香港交易所上市股票）。\n"
            "- 港股无涨跌停限制，支持 T+0 交易，需关注港币汇率、南北向资金流及联交所特有规则。"
        ),
        "en": (
            "- This analysis covers a **Hong Kong stock** (listed on HKEX).\n"
            "- HK stocks have no daily price limits, allow T+0 trading. Consider HKD FX, Southbound/Northbound flows, and HKEX-specific rules."
        ),
    },
    "us": {
        "zh": (
            "- 本次分析对象为 **美股**（美国交易所上市股票）。\n"
            "- 美股无涨跌停限制（但有熔断机制），支持 T+0 交易和盘前盘后交易，需关注美元汇率、美联储政策及 SEC 监管动态。"
        ),
        "en": (
            "- This analysis covers a **US stock** (listed on NYSE/NASDAQ).\n"
            "- US stocks have no daily price limits (but have circuit breakers), allow T+0 and pre/after-market trading. Consider USD FX, Fed policy, and SEC regulations."
        ),
    },
}


def get_market_role(stock_code: Optional[str], lang: str = "zh") -> str:
    """Return market-specific role description for LLM prompt.

    Args:
        stock_code: The stock code being analyzed.
        lang: 'zh' or 'en'.

    Returns:
        Role string like 'A 股投资分析' or 'US stock investment analysis'.
    """
    market = detect_market(stock_code)
    lang_key = "en" if lang == "en" else "zh"
    return _MARKET_ROLES.get(market, _MARKET_ROLES["cn"])[lang_key]


def get_market_guidelines(stock_code: Optional[str], lang: str = "zh") -> str:
    """Return market-specific analysis guidelines for LLM prompt.

    Args:
        stock_code: The stock code being analyzed.
        lang: 'zh' or 'en'.

    Returns:
        Multi-line string with market-specific guidelines.
    """
    market = detect_market(stock_code)
    lang_key = "en" if lang == "en" else "zh"
    return _MARKET_GUIDELINES.get(market, _MARKET_GUIDELINES["cn"])[lang_key]
