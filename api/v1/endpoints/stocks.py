# -*- coding: utf-8 -*-
"""
===================================
股票数据接口
===================================

职责：
1. POST /api/v1/stocks/extract-from-image 从图片提取股票代码
2. POST /api/v1/stocks/parse-import 解析 CSV/Excel/剪贴板
3. GET /api/v1/stocks/{code}/quote 实时行情接口
4. GET /api/v1/stocks/{code}/history 历史行情接口
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile

from api.v1.schemas.stocks import (
    ExtractFromImageResponse,
    ExtractItem,
    KLineData,
    StockHistoryResponse,
    StockQuote,
    OrderBookResponse,
    OrderBookLevel,
    TradeTick,
    TradeTicksResponse,
    IndexQuote,
    IndexBarsResponse,
    FinanceInfoResponse,
    XdxrItem,
    XdxrResponse,
    RpsResponse,
    DivergenceSignal,
    DivergenceResponse,
    ResonanceSignal,
    ResonanceResponse,
    BacktestSummaryItem,
    BacktestSummaryResponse,
)
from api.v1.schemas.common import ErrorResponse
from src.services.image_stock_extractor import (
    ALLOWED_MIME,
    MAX_SIZE_BYTES,
    extract_stock_codes_from_image,
)
from src.services.import_parser import (
    MAX_FILE_BYTES,
    parse_import_from_bytes,
    parse_import_from_text,
)
from src.services.stock_service import StockService

logger = logging.getLogger(__name__)

router = APIRouter()

# 须在 /{stock_code} 路由之前定义
ALLOWED_MIME_STR = ", ".join(ALLOWED_MIME)


@router.post(
    "/extract-from-image",
    response_model=ExtractFromImageResponse,
    responses={
        200: {"description": "提取的股票代码"},
        400: {"description": "图片无效", "model": ErrorResponse},
        500: {"description": "服务器错误", "model": ErrorResponse},
    },
    summary="从图片提取股票代码",
    description="上传截图/图片，通过 Vision LLM 提取股票代码。支持 JPEG、PNG、WebP、GIF，最大 5MB。",
)
def extract_from_image(
    file: Optional[UploadFile] = File(None, description="图片文件（表单字段名 file）"),
    include_raw: bool = Query(False, description="是否在结果中包含原始 LLM 响应"),
) -> ExtractFromImageResponse:
    """
    从上传的图片中提取股票代码（使用 Vision LLM）。

    表单字段请使用 file 上传图片。优先级：Gemini / Anthropic / OpenAI（首个可用）。
    """
    if not file or not file.filename:
        raise HTTPException(
            status_code=400,
            detail={"error": "bad_request", "message": "未提供文件，请使用表单字段 file 上传图片"},
        )

    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "unsupported_type",
                "message": f"不支持的类型: {content_type}。允许: {ALLOWED_MIME_STR}",
            },
        )

    try:
        # 先读取限定大小，再检查是否还有剩余（语义清晰：超出则拒绝）
        data = file.file.read(MAX_SIZE_BYTES)
        if file.file.read(1):
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "file_too_large",
                    "message": f"图片超过 {MAX_SIZE_BYTES // (1024 * 1024)}MB 限制",
                },
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"读取上传文件失败: {e}")
        raise HTTPException(
            status_code=400,
            detail={"error": "read_failed", "message": "读取上传文件失败"},
        )

    try:
        items, raw_text = extract_stock_codes_from_image(data, content_type)
        extract_items = [
            ExtractItem(code=code, name=name, confidence=conf) for code, name, conf in items
        ]
        codes = [i.code for i in extract_items]
        return ExtractFromImageResponse(
            codes=codes,
            items=extract_items,
            raw_text=raw_text if include_raw else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"error": "extract_failed", "message": str(e)})
    except Exception as e:
        logger.error(f"图片提取失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"error": "internal_error", "message": "图片提取失败"},
        )


@router.post(
    "/parse-import",
    response_model=ExtractFromImageResponse,
    responses={
        200: {"description": "解析结果"},
        400: {"description": "未提供数据或解析失败", "model": ErrorResponse},
        500: {"description": "服务器错误", "model": ErrorResponse},
    },
    summary="解析 CSV/Excel/剪贴板",
    description="上传 CSV/Excel 文件或粘贴文本，自动解析股票代码。文件上限 2MB，文本上限 100KB。",
)
async def parse_import(request: Request) -> ExtractFromImageResponse:
    """
    解析 CSV/Excel 文件或剪贴板文本。

    - multipart/form-data + file: 上传文件
    - application/json + {"text": "..."}: 粘贴文本
    - 优先使用 file，若同时提供则忽略 text
    """
    content_type = (request.headers.get("content-type") or "").lower()

    if "application/json" in content_type:
        try:
            body = await request.json()
        except Exception as e:
            logger.warning("[parse_import] JSON parse failed: %s", e)
            raise HTTPException(
                status_code=400,
                detail={"error": "invalid_json", "message": f"JSON 解析失败: {e}"},
            )
        text = body.get("text") if isinstance(body, dict) else None
        if not text or not isinstance(text, str):
            raise HTTPException(
                status_code=400,
                detail={"error": "bad_request", "message": "未提供 text，请使用 {\"text\": \"...\"}"},
            )
        try:
            items = parse_import_from_text(text)
        except ValueError as e:
            text_bytes = len(text.encode("utf-8"))
            logger.warning(
                "[parse_import] parse_import_from_text failed: text_bytes=%d, error=%s",
                text_bytes,
                e,
            )
            raise HTTPException(status_code=400, detail={"error": "parse_failed", "message": str(e)})
    elif "multipart" in content_type:
        form = await request.form()
        file = form.get("file")
        if not file or not hasattr(file, "read"):
            raise HTTPException(
                status_code=400,
                detail={"error": "bad_request", "message": "未提供文件，请使用表单字段 file"},
            )
        file_size = getattr(file, "size", None)
        if isinstance(file_size, int) and file_size > MAX_FILE_BYTES:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "file_too_large",
                    "message": f"文件超过 {MAX_FILE_BYTES // (1024 * 1024)}MB 限制",
                },
            )
        try:
            data = file.file.read(MAX_FILE_BYTES)
            if file.file.read(1):
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "file_too_large",
                        "message": f"文件超过 {MAX_FILE_BYTES // (1024 * 1024)}MB 限制",
                    },
                )
        except HTTPException:
            raise
        except Exception as e:
            filename = getattr(file, "filename", None) or ""
            size = getattr(file, "size", None)
            logger.warning(
                "[parse_import] file read failed: filename=%r, size=%s, error=%s",
                filename,
                size,
                e,
            )
            raise HTTPException(
                status_code=400,
                detail={"error": "read_failed", "message": "读取文件失败"},
            )
        filename = getattr(file, "filename", None) or ""
        try:
            items = parse_import_from_bytes(data, filename=filename)
        except ValueError as e:
            ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
            logger.warning(
                "[parse_import] parse_import_from_bytes failed: filename=%r, ext=%r, bytes=%d, error=%s",
                filename,
                ext,
                len(data),
                e,
            )
            raise HTTPException(status_code=400, detail={"error": "parse_failed", "message": str(e)})
    else:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "bad_request",
                "message": "请使用 multipart/form-data 上传文件，或 application/json 提交 {\"text\": \"...\"}",
            },
        )

    extract_items = [
        ExtractItem(code=code, name=name, confidence=conf)
        for code, name, conf in items
    ]
    codes = list(dict.fromkeys(i.code for i in extract_items if i.code))
    return ExtractFromImageResponse(codes=codes, items=extract_items, raw_text=None)


@router.get(
    "/indices/quotes",
    response_model=List[IndexQuote],
    summary="获取大盘指数行情",
    description="获取主要大盘指数的实时行情数据"
)
def get_index_quotes():
    try:
        service = StockService()
        results = service.get_index_quotes()
        return [IndexQuote(**r) for r in results]
    except Exception as e:
        logger.error(f"获取指数行情失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail={"error": "internal_error", "message": f"获取指数行情失败: {str(e)}"})


@router.get(
    "/{stock_code}/quote",
    response_model=StockQuote,
    responses={
        200: {"description": "行情数据"},
        404: {"description": "股票不存在", "model": ErrorResponse},
        500: {"description": "服务器错误", "model": ErrorResponse},
    },
    summary="获取股票实时行情",
    description="获取指定股票的最新行情数据"
)
def get_stock_quote(stock_code: str) -> StockQuote:
    """
    获取股票实时行情
    
    获取指定股票的最新行情数据
    
    Args:
        stock_code: 股票代码（如 600519、00700、AAPL）
        
    Returns:
        StockQuote: 实时行情数据
        
    Raises:
        HTTPException: 404 - 股票不存在
    """
    try:
        service = StockService()
        
        # 使用 def 而非 async def，FastAPI 自动在线程池中执行
        result = service.get_realtime_quote(stock_code)
        
        if result is None:
            raise HTTPException(
                status_code=404,
                detail={
                    "error": "not_found",
                    "message": f"未找到股票 {stock_code} 的行情数据"
                }
            )
        
        return StockQuote(
            stock_code=result.get("stock_code", stock_code),
            stock_name=result.get("stock_name"),
            current_price=result.get("current_price", 0.0),
            change=result.get("change"),
            change_percent=result.get("change_percent"),
            open=result.get("open"),
            high=result.get("high"),
            low=result.get("low"),
            prev_close=result.get("prev_close"),
            volume=result.get("volume"),
            amount=result.get("amount"),
            volume_ratio=result.get("volume_ratio"),
            turnover_rate=result.get("turnover_rate"),
            amplitude=result.get("amplitude"),
            pe_ratio=result.get("pe_ratio"),
            pb_ratio=result.get("pb_ratio"),
            total_mv=result.get("total_mv"),
            circ_mv=result.get("circ_mv"),
            high_52w=result.get("high_52w"),
            low_52w=result.get("low_52w"),
            update_time=result.get("update_time")
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取实时行情失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "internal_error",
                "message": f"获取实时行情失败: {str(e)}"
            }
        )


@router.get(
    "/{stock_code}/history",
    response_model=StockHistoryResponse,
    responses={
        200: {"description": "历史行情数据"},
        422: {"description": "不支持的周期参数", "model": ErrorResponse},
        500: {"description": "服务器错误", "model": ErrorResponse},
    },
    summary="获取股票历史行情",
    description="获取指定股票的历史 K 线数据"
)
def get_stock_history(
    stock_code: str,
    period: str = Query("daily", description="K 线周期", pattern="^(daily|weekly|monthly|1min|5min|15min|30min|60min)$"),
    days: int = Query(30, ge=1, le=10000, description="获取天数")
) -> StockHistoryResponse:
    """
    获取股票历史行情
    
    获取指定股票的历史 K 线数据
    
    Args:
        stock_code: 股票代码
        period: K 线周期 (daily/weekly/monthly)
        days: 获取天数
        
    Returns:
        StockHistoryResponse: 历史行情数据
    """
    try:
        service = StockService()
        
        # 使用 def 而非 async def，FastAPI 自动在线程池中执行
        result = service.get_history_data(
            stock_code=stock_code,
            period=period,
            days=days
        )
        
        # 转换为响应模型
        data = [
            KLineData(
                date=item.get("date"),
                open=item.get("open"),
                high=item.get("high"),
                low=item.get("low"),
                close=item.get("close"),
                volume=item.get("volume"),
                amount=item.get("amount"),
                change_percent=item.get("change_percent")
            )
            for item in result.get("data", [])
        ]
        
        return StockHistoryResponse(
            stock_code=stock_code,
            stock_name=result.get("stock_name"),
            period=period,
            data=data
        )
    
    except ValueError as e:
        # period 参数不支持的错误（如 weekly/monthly）
        raise HTTPException(
            status_code=422,
            detail={
                "error": "unsupported_period",
                "message": str(e)
            }
        )
    except Exception as e:
        logger.error(f"获取历史行情失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "internal_error",
                "message": f"获取历史行情失败: {str(e)}"
            }
        )


@router.get(
    "/{stock_code}/orderbook",
    response_model=OrderBookResponse,
    summary="获取五档盘口",
    description="获取指定股票的买卖五档盘口数据"
)
def get_orderbook(stock_code: str):
    try:
        service = StockService()
        result = service.get_orderbook(stock_code)
        if result is None:
            raise HTTPException(status_code=404, detail={"error": "not_found", "message": f"未找到 {stock_code} 的盘口数据"})
        return OrderBookResponse(
            code=result.get("code", stock_code),
            name=result.get("name"),
            price=result.get("price", 0),
            pre_close=result.get("pre_close", 0),
            bids=[OrderBookLevel(price=b.get("price", 0), volume=b.get("volume", 0)) for b in result.get("bids", [])],
            asks=[OrderBookLevel(price=a.get("price", 0), volume=a.get("volume", 0)) for a in result.get("asks", [])],
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取五档盘口失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail={"error": "internal_error", "message": f"获取五档盘口失败: {str(e)}"})


@router.get(
    "/{stock_code}/ticks",
    response_model=TradeTicksResponse,
    summary="获取成交明细",
    description="获取指定股票的最近成交明细"
)
def get_trade_ticks(stock_code: str, count: int = Query(50, ge=1, le=200, description="返回条数")):
    try:
        service = StockService()
        result = service.get_trade_ticks(stock_code, count=count)
        if result is None:
            return TradeTicksResponse(code=stock_code, ticks=[])
        ticks = [
            TradeTick(
                time=t.get("time", ""),
                price=t.get("price", 0),
                volume=t.get("volume", 0),
                num=t.get("num", 0),
                type=t.get("type", 0),
            )
            for t in result
        ]
        return TradeTicksResponse(code=stock_code, ticks=ticks)
    except Exception as e:
        logger.error(f"获取成交明细失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail={"error": "internal_error", "message": f"获取成交明细失败: {str(e)}"})


@router.get(
    "/{stock_code}/finance",
    response_model=FinanceInfoResponse,
    summary="获取财务信息",
    description="获取指定股票的财务数据（通达信直连，近实时）"
)
def get_finance_info(stock_code: str):
    try:
        service = StockService()
        result = service.get_finance_info(stock_code)
        if result is None:
            raise HTTPException(status_code=404, detail={"error": "not_found", "message": f"未找到 {stock_code} 的财务数据"})
        return FinanceInfoResponse(
            code=result.get('code', stock_code),
            source=result.get('source', ''),
            updated_date=result.get('updated_date', ''),
            total_shares=result.get('total_shares'),
            float_shares=result.get('float_shares'),
            bps=result.get('bps'),
            main_revenue=result.get('main_revenue'),
            net_profit=result.get('net_profit'),
            net_assets=result.get('net_assets'),
            total_assets=result.get('total_assets'),
            operating_cash_flow=result.get('operating_cash_flow'),
            shareholder_count=result.get('shareholder_count'),
            pe_dynamic=result.get('pe_dynamic'),
            pb_ratio=result.get('pb_ratio'),
            roe=result.get('roe'),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取财务信息失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail={"error": "internal_error", "message": f"获取财务信息失败: {str(e)}"})


@router.get(
    "/{stock_code}/xdxr",
    response_model=XdxrResponse,
    summary="获取除权除息",
    description="获取指定股票的除权除息历史记录"
)
def get_xdxr_info(stock_code: str):
    try:
        service = StockService()
        result = service.get_xdxr_info(stock_code)
        if result is None:
            return XdxrResponse(code=stock_code, records=[])
        records = [XdxrItem(**item) for item in result]
        return XdxrResponse(code=stock_code, records=records)
    except Exception as e:
        logger.error(f"获取除权除息失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail={"error": "internal_error", "message": f"获取除权除息失败: {str(e)}"})


@router.get(
    "/{stock_code}/rps",
    response_model=RpsResponse,
    summary="获取RPS相对强度",
    description="获取指定股票的RPS(相对价格强度)指标，基于全市场涨幅排名"
)
def get_rps(stock_code: str, period: int = Query(60, ge=10, le=250, description="统计区间(天)")):
    try:
        from src.services.signal_service import SignalService
        svc = SignalService()
        result = svc.compute_rps(stock_code, period=period)
        return RpsResponse(**result)
    except Exception as e:
        logger.error(f"获取RPS失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail={"error": "internal_error", "message": f"获取RPS失败: {str(e)}"})


@router.get(
    "/{stock_code}/divergence",
    response_model=DivergenceResponse,
    summary="获取量价背离信号",
    description="检测顶背离、底背离、放量突破、缩量上涨等量价背离信号"
)
def get_divergence(stock_code: str):
    try:
        from src.services.signal_service import SignalService
        svc = SignalService()
        result = svc.detect_divergence(stock_code)
        return DivergenceResponse(**result)
    except Exception as e:
        logger.error(f"获取背离信号失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail={"error": "internal_error", "message": f"获取背离信号失败: {str(e)}"})


@router.get(
    "/{stock_code}/resonance",
    response_model=ResonanceResponse,
    summary="获取多指标共振信号",
    description="综合均线、MACD、量价等多维度信号，计算共振评分(-100~100)"
)
def get_resonance(stock_code: str):
    try:
        from src.services.signal_service import SignalService
        svc = SignalService()
        result = svc.compute_resonance(stock_code)
        return ResonanceResponse(**result)
    except Exception as e:
        logger.error(f"获取共振信号失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail={"error": "internal_error", "message": f"获取共振信号失败: {str(e)}"})


@router.get(
    "/{stock_code}/backtest-summary",
    response_model=BacktestSummaryResponse,
    summary="获取回测结果摘要",
    description="获取指定股票的历史分析回测结果，包括方向准确率和近期评估记录"
)
def get_backtest_summary(stock_code: str):
    try:
        from src.services.signal_service import SignalService
        svc = SignalService()
        result = svc.get_backtest_summary(stock_code)
        return BacktestSummaryResponse(**result)
    except Exception as e:
        logger.error(f"获取回测摘要失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail={"error": "internal_error", "message": f"获取回测摘要失败: {str(e)}"})
