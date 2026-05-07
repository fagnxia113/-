# -*- coding: utf-8 -*-
import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from src.formula.engine import FormulaEngine
from src.formula.indicators import INDICATOR_REGISTRY
from src.services.stock_service import StockService

logger = logging.getLogger(__name__)

router = APIRouter()


class FormulaEvaluateRequest(BaseModel):
    stock_code: str = Field(..., description="股票代码")
    formula: str = Field(..., description="通达信公式文本")
    period: str = Field("daily", description="K线周期")
    days: int = Field(120, ge=1, le=500, description="获取天数")

    class Config:
        json_schema_extra = {
            "example": {
                "stock_code": "600519",
                "formula": "VAR1:=MA(CLOSE,5);MA5:MA(CLOSE,5);MA10:MA(CLOSE,10);",
                "period": "daily",
                "days": 120,
            }
        }


class FormulaEvaluateResponse(BaseModel):
    stock_code: str = Field(..., description="股票代码")
    outputs: Dict[str, List[float]] = Field(default_factory=dict, description="公式输出变量")


class IndicatorInfo(BaseModel):
    name: str = Field(..., description="指标名称")
    description: str = Field(..., description="指标描述")
    params: List[Dict] = Field(default_factory=list, description="指标参数")


class IndicatorListResponse(BaseModel):
    indicators: List[IndicatorInfo] = Field(default_factory=list, description="可用指标列表")


class IndicatorEvaluateResponse(BaseModel):
    stock_code: str = Field(..., description="股票代码")
    indicator: str = Field(..., description="指标名称")
    outputs: Dict[str, List[float]] = Field(default_factory=dict, description="指标输出")


def _get_stock_dataframe(stock_code: str, period: str, days: int):
    service = StockService()
    result = service.get_history_data(stock_code, period=period, days=days)
    data = result.get("data", [])
    if not data:
        return None
    import pandas as pd
    df = pd.DataFrame(data)
    for col in ["open", "high", "low", "close", "volume"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
    if "amount" in df.columns:
        df["amount"] = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)
    if "change_percent" in df.columns:
        df["pct_chg"] = pd.to_numeric(df["change_percent"], errors="coerce").fillna(0.0)
    return df


@router.post(
    "/evaluate",
    response_model=FormulaEvaluateResponse,
    responses={
        200: {"description": "公式执行结果"},
        400: {"description": "公式语法错误"},
        404: {"description": "股票数据不存在"},
        500: {"description": "服务器错误"},
    },
    summary="执行自定义公式",
    description="执行通达信自定义公式，返回输出变量序列",
)
def evaluate_formula(request: FormulaEvaluateRequest) -> FormulaEvaluateResponse:
    try:
        df = _get_stock_dataframe(request.stock_code, request.period, request.days)
        if df is None or df.empty:
            raise HTTPException(
                status_code=404,
                detail={"error": "not_found", "message": f"未找到股票 {request.stock_code} 的数据"},
            )
        engine = FormulaEngine()
        outputs = engine.evaluate(request.formula, df)
        return FormulaEvaluateResponse(
            stock_code=request.stock_code,
            outputs=outputs,
        )
    except HTTPException:
        raise
    except SyntaxError as e:
        raise HTTPException(
            status_code=400,
            detail={"error": "syntax_error", "message": f"公式语法错误: {str(e)}"},
        )
    except NameError as e:
        raise HTTPException(
            status_code=400,
            detail={"error": "undefined_var", "message": str(e)},
        )
    except Exception as e:
        logger.error(f"公式执行失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"error": "internal_error", "message": f"公式执行失败: {str(e)}"},
        )


@router.get(
    "/indicators",
    response_model=IndicatorListResponse,
    summary="获取可用指标列表",
    description="返回所有预实现的经典技术指标列表",
)
def list_indicators() -> IndicatorListResponse:
    indicators = [
        IndicatorInfo(
            name=cfg["name"],
            description=cfg["description"],
            params=cfg.get("params", []),
        )
        for cfg in INDICATOR_REGISTRY.values()
    ]
    return IndicatorListResponse(indicators=indicators)


@router.get(
    "/indicator/{name}",
    response_model=IndicatorEvaluateResponse,
    responses={
        200: {"description": "指标计算结果"},
        400: {"description": "不支持的指标"},
        404: {"description": "股票数据不存在"},
        500: {"description": "服务器错误"},
    },
    summary="执行指定指标",
    description="对指定股票计算预定义的技术指标",
)
def evaluate_indicator(
    name: str,
    stock_code: str = Query(..., description="股票代码"),
    period: str = Query("daily", description="K线周期"),
    days: int = Query(120, ge=1, le=500, description="获取天数"),
) -> IndicatorEvaluateResponse:
    name_upper = name.upper()
    if name_upper not in INDICATOR_REGISTRY:
        raise HTTPException(
            status_code=400,
            detail={"error": "unsupported_indicator", "message": f"不支持的指标: {name}，可用: {', '.join(INDICATOR_REGISTRY.keys())}"},
        )
    try:
        df = _get_stock_dataframe(stock_code, period, days)
        if df is None or df.empty:
            raise HTTPException(
                status_code=404,
                detail={"error": "not_found", "message": f"未找到股票 {stock_code} 的数据"},
            )
        cfg = INDICATOR_REGISTRY[name_upper]
        outputs = cfg["fn"](df)
        return IndicatorEvaluateResponse(
            stock_code=stock_code,
            indicator=name_upper,
            outputs=outputs,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"指标计算失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"error": "internal_error", "message": f"指标计算失败: {str(e)}"},
        )
