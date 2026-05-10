# -*- coding: utf-8 -*-
"""
===================================
股票数据相关模型
===================================

职责：
1. 定义股票实时行情模型
2. 定义历史 K 线数据模型
"""

from typing import Optional, List

from pydantic import BaseModel, Field


class StockQuote(BaseModel):
    """股票实时行情"""
    
    stock_code: str = Field(..., description="股票代码")
    stock_name: Optional[str] = Field(None, description="股票名称")
    current_price: float = Field(..., description="当前价格")
    change: Optional[float] = Field(None, description="涨跌额")
    change_percent: Optional[float] = Field(None, description="涨跌幅 (%)")
    open: Optional[float] = Field(None, description="开盘价")
    high: Optional[float] = Field(None, description="最高价")
    low: Optional[float] = Field(None, description="最低价")
    prev_close: Optional[float] = Field(None, description="昨收价")
    volume: Optional[float] = Field(None, description="成交量（股）")
    amount: Optional[float] = Field(None, description="成交额（元）")
    volume_ratio: Optional[float] = Field(None, description="量比")
    turnover_rate: Optional[float] = Field(None, description="换手率 (%)")
    amplitude: Optional[float] = Field(None, description="振幅 (%)")
    pe_ratio: Optional[float] = Field(None, description="市盈率(动态)")
    pb_ratio: Optional[float] = Field(None, description="市净率")
    total_mv: Optional[float] = Field(None, description="总市值（元）")
    circ_mv: Optional[float] = Field(None, description="流通市值（元）")
    high_52w: Optional[float] = Field(None, description="52周最高")
    low_52w: Optional[float] = Field(None, description="52周最低")
    update_time: Optional[str] = Field(None, description="更新时间")
    
    class Config:
        json_schema_extra = {
            "example": {
                "stock_code": "600519",
                "stock_name": "贵州茅台",
                "current_price": 1800.00,
                "change": 15.00,
                "change_percent": 0.84,
                "open": 1785.00,
                "high": 1810.00,
                "low": 1780.00,
                "prev_close": 1785.00,
                "volume": 10000000,
                "amount": 18000000000,
                "update_time": "2024-01-01T15:00:00"
            }
        }


class KLineData(BaseModel):
    """K 线数据点"""
    
    date: str = Field(..., description="日期")
    open: float = Field(..., description="开盘价")
    high: float = Field(..., description="最高价")
    low: float = Field(..., description="最低价")
    close: float = Field(..., description="收盘价")
    volume: Optional[float] = Field(None, description="成交量")
    amount: Optional[float] = Field(None, description="成交额")
    change_percent: Optional[float] = Field(None, description="涨跌幅 (%)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "date": "2024-01-01",
                "open": 1785.00,
                "high": 1810.00,
                "low": 1780.00,
                "close": 1800.00,
                "volume": 10000000,
                "amount": 18000000000,
                "change_percent": 0.84
            }
        }


class ExtractItem(BaseModel):
    """单条提取结果（代码、名称、置信度）"""

    code: Optional[str] = Field(None, description="股票代码，None 表示解析失败")
    name: Optional[str] = Field(None, description="股票名称（如有）")
    confidence: str = Field("medium", description="置信度：high/medium/low")


class ExtractFromImageResponse(BaseModel):
    """图片股票代码提取响应"""

    codes: List[str] = Field(..., description="提取的股票代码（已去重，向后兼容）")
    items: List[ExtractItem] = Field(default_factory=list, description="提取结果明细（代码+名称+置信度）")
    raw_text: Optional[str] = Field(None, description="原始 LLM 响应（调试用）")


class StockHistoryResponse(BaseModel):
    """股票历史行情响应"""
    
    stock_code: str = Field(..., description="股票代码")
    stock_name: Optional[str] = Field(None, description="股票名称")
    period: str = Field(..., description="K 线周期")
    data: List[KLineData] = Field(default_factory=list, description="K 线数据列表")
    
    class Config:
        json_schema_extra = {
            "example": {
                "stock_code": "600519",
                "stock_name": "贵州茅台",
                "period": "daily",
                "data": []
            }
        }


class OrderBookLevel(BaseModel):
    price: float = Field(0, description="价格")
    volume: int = Field(0, description="挂单量（手）")


class OrderBookResponse(BaseModel):
    code: str = Field(..., description="股票代码")
    name: Optional[str] = Field(None, description="股票名称")
    price: float = Field(0, description="最新价")
    pre_close: float = Field(0, description="昨收价")
    bids: List[OrderBookLevel] = Field(default_factory=list, description="买盘五档")
    asks: List[OrderBookLevel] = Field(default_factory=list, description="卖盘五档")


class TradeTick(BaseModel):
    time: str = Field("", description="成交时间")
    price: float = Field(0, description="成交价格")
    volume: int = Field(0, description="成交量（手）")
    num: int = Field(0, description="成交笔数")
    type: int = Field(0, description="成交方向: 0-买, 1-卖, 2-中性")


class TradeTicksResponse(BaseModel):
    code: str = Field(..., description="股票代码")
    ticks: List[TradeTick] = Field(default_factory=list, description="成交明细列表")


class IndexQuote(BaseModel):
    """大盘指数行情"""
    code: str = Field(..., description="指数代码")
    name: str = Field("", description="指数名称")
    price: float = Field(0, description="最新点位")
    change: Optional[float] = Field(None, description="涨跌点数")
    change_percent: Optional[float] = Field(None, description="涨跌幅 (%)")
    volume: Optional[float] = Field(None, description="成交量")
    amount: Optional[float] = Field(None, description="成交额")
    up_count: Optional[int] = Field(None, description="上涨家数")
    down_count: Optional[int] = Field(None, description="下跌家数")


class IndexBarsResponse(BaseModel):
    """指数K线响应"""
    code: str = Field(..., description="指数代码")
    name: str = Field("", description="指数名称")
    period: str = Field(..., description="K线周期")
    data: List[KLineData] = Field(default_factory=list, description="K线数据")


class FinanceInfoResponse(BaseModel):
    """财务信息响应"""
    code: str = Field(..., description="股票代码")
    source: str = Field("", description="数据来源")
    updated_date: str = Field("", description="财报更新日期")
    total_shares: Optional[float] = Field(None, description="总股本(万股)")
    float_shares: Optional[float] = Field(None, description="流通股(万股)")
    bps: Optional[float] = Field(None, description="每股净资产")
    main_revenue: Optional[float] = Field(None, description="主营收入")
    net_profit: Optional[float] = Field(None, description="净利润")
    net_assets: Optional[float] = Field(None, description="净资产")
    total_assets: Optional[float] = Field(None, description="总资产")
    operating_cash_flow: Optional[float] = Field(None, description="经营现金流")
    shareholder_count: Optional[float] = Field(None, description="股东人数")
    pe_dynamic: Optional[float] = Field(None, description="动态PE")
    pb_ratio: Optional[float] = Field(None, description="PB")
    roe: Optional[float] = Field(None, description="ROE(%)")


class XdxrItem(BaseModel):
    """除权除息记录"""
    year: Optional[int] = Field(None)
    month: Optional[int] = Field(None)
    day: Optional[int] = Field(None)
    category: Optional[int] = Field(None, description="类别: 1-除权除息, 5-股本变化")
    category_name: Optional[str] = Field(None, description="类别名称")
    dividend_per_share: Optional[float] = Field(None, description="每股分红(元)")
    bonus_share_ratio: Optional[float] = Field(None, description="送股比例")
    rights_issue_ratio: Optional[float] = Field(None, description="配股比例")
    rights_issue_price: Optional[float] = Field(None, description="配股价")
    total_shares_after: Optional[float] = Field(None, description="变动后总股本(万股)")
    float_shares_after: Optional[float] = Field(None, description="变动后流通股(万股)")


class XdxrResponse(BaseModel):
    """除权除息响应"""
    code: str = Field(..., description="股票代码")
    records: List[XdxrItem] = Field(default_factory=list, description="除权除息记录")


class RpsResponse(BaseModel):
    code: str = Field(..., description="股票代码")
    rps: Optional[float] = Field(None, description="RPS相对强度(0-100)")
    period_return: Optional[float] = Field(None, description="区间涨跌幅(%)")
    rank_desc: str = Field("", description="强度描述: 极强/强势/中性偏强/弱势/极弱")
    period_days: int = Field(60, description="统计区间(天)")


class DivergenceSignal(BaseModel):
    type: str = Field(..., description="信号类型")
    name: str = Field(..., description="信号名称")
    direction: str = Field(..., description="方向: bullish/bearish")
    strength: str = Field("medium", description="强度: strong/medium/weak")
    description: str = Field("", description="信号描述")
    date: str = Field("", description="信号日期")


class DivergenceResponse(BaseModel):
    code: str = Field(..., description="股票代码")
    signals: List[DivergenceSignal] = Field(default_factory=list)
    bull_count: int = Field(0, description="看多信号数")
    bear_count: int = Field(0, description="看空信号数")
    summary: str = Field("", description="综合描述")


class ResonanceSignal(BaseModel):
    name: str = Field(..., description="信号名称")
    direction: str = Field(..., description="方向: bullish/bearish")
    weight: int = Field(0, description="权重分")


class ResonanceResponse(BaseModel):
    code: str = Field(..., description="股票代码")
    score: int = Field(0, description="共振评分(-100~100)")
    level: str = Field("", description="评级: 强烈看多/偏多/中性/偏空/强烈看空")
    signals: List[ResonanceSignal] = Field(default_factory=list)
    bull_count: int = Field(0)
    bear_count: int = Field(0)


class BacktestSummaryItem(BaseModel):
    analysis_date: Optional[str] = None
    operation_advice: Optional[str] = None
    direction_correct: Optional[bool] = None
    stock_return_pct: Optional[float] = None
    simulated_return_pct: Optional[float] = None


class BacktestSummaryResponse(BaseModel):
    code: str = Field(...)
    has_data: bool = Field(False)
    summary: Optional[dict] = Field(None)
    recent: List[BacktestSummaryItem] = Field(default_factory=list)
