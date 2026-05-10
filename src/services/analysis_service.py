# -*- coding: utf-8 -*-
"""
===================================
分析服务层
===================================

职责：
1. 封装股票分析逻辑
2. 调用 analyzer 和 pipeline 执行分析
3. 保存分析结果到数据库
"""

import logging
import uuid
from typing import Optional, Dict, Any, Callable

from src.repositories.analysis_repo import AnalysisRepository
from src.report_language import (
    get_sentiment_label,
    get_localized_stock_name,
    localize_operation_advice,
    localize_trend_prediction,
    normalize_report_language,
)

logger = logging.getLogger(__name__)


class AnalysisService:
    """
    分析服务
    
    封装股票分析相关的业务逻辑
    """
    
    def __init__(self):
        """初始化分析服务"""
        self.repo = AnalysisRepository()
        self.last_error: Optional[str] = None
    
    def analyze_stock(
        self,
        stock_code: str,
        report_type: str = "detailed",
        force_refresh: bool = False,
        query_id: Optional[str] = None,
        send_notification: bool = True,
        progress_callback: Optional[Callable[[int, str], None]] = None,
        event_bus=None,
    ) -> Optional[Dict[str, Any]]:
        """
        执行股票分析
        
        Args:
            stock_code: 股票代码
            report_type: 报告类型 (simple/detailed)
            force_refresh: 是否强制刷新
            query_id: 查询 ID（可选）
            send_notification: 是否发送通知（API 触发默认发送）
            
        Returns:
            分析结果字典，包含:
            - stock_code: 股票代码
            - stock_name: 股票名称
            - report: 分析报告
        """
        try:
            self.last_error = None
            # 导入分析相关模块
            from src.config import get_config
            from src.core.pipeline import StockAnalysisPipeline
            from src.enums import ReportType
            
            # 生成 query_id
            if query_id is None:
                query_id = uuid.uuid4().hex
            
            # 获取配置
            config = get_config()
            
            # 创建分析流水线
            pipeline = StockAnalysisPipeline(
                config=config,
                query_id=query_id,
                query_source="api",
                progress_callback=progress_callback,
                event_bus=event_bus,
            )
            
            # 确定报告类型 (API: simple/detailed/full/brief -> ReportType)
            rt = ReportType.from_str(report_type)
            
            # 执行分析
            result = pipeline.process_single_stock(
                code=stock_code,
                skip_analysis=False,
                single_stock_notify=send_notification,
                report_type=rt,
            )
            
            if result is None:
                logger.warning(f"分析股票 {stock_code} 返回空结果")
                self.last_error = self.last_error or f"分析股票 {stock_code} 返回空结果"
                return None

            if not getattr(result, "success", True):
                self.last_error = getattr(result, "error_message", None) or f"分析股票 {stock_code} 失败"
                logger.warning(f"分析股票 {stock_code} 未成功完成: {self.last_error}")
                return None
            
            # 构建响应
            return self._build_analysis_response(result, query_id, report_type=rt.value)
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"分析股票 {stock_code} 失败: {e}", exc_info=True)
            return None
    
    def _build_analysis_response(
        self, 
        result: Any, 
        query_id: str,
        report_type: str = "detailed",
    ) -> Dict[str, Any]:
        """
        构建分析响应
        
        Args:
            result: AnalysisResult 对象
            query_id: 查询 ID
            report_type: 归一化后的报告类型
            
        Returns:
            格式化的响应字典
        """
        # 获取狙击点位
        sniper_points = {}
        if hasattr(result, 'get_sniper_points'):
            sniper_points = result.get_sniper_points() or {}
        
        # 计算情绪标签
        report_language = normalize_report_language(getattr(result, "report_language", "zh"))
        sentiment_label = get_sentiment_label(result.sentiment_score, report_language)
        stock_name = get_localized_stock_name(getattr(result, "name", None), result.code, report_language)
        
        # 获取历史对比数据
        history_comparison = self._build_history_comparison(result.code, result.sentiment_score, result.operation_advice, report_language)
        
        # 构建报告结构
        report = {
            "meta": {
                "query_id": query_id,
                "stock_code": result.code,
                "stock_name": stock_name,
                "report_type": report_type,
                "report_language": report_language,
                "current_price": result.current_price,
                "change_pct": result.change_pct,
                "model_used": getattr(result, "model_used", None),
            },
            "summary": {
                "analysis_summary": result.analysis_summary,
                "operation_advice": localize_operation_advice(result.operation_advice, report_language),
                "trend_prediction": localize_trend_prediction(result.trend_prediction, report_language),
                "sentiment_score": result.sentiment_score,
                "sentiment_label": sentiment_label,
            },
            "strategy": {
                "ideal_buy": sniper_points.get("ideal_buy"),
                "secondary_buy": sniper_points.get("secondary_buy"),
                "stop_loss": sniper_points.get("stop_loss"),
                "take_profit": sniper_points.get("take_profit"),
            },
            "details": {
                "news_summary": result.news_summary,
                "technical_analysis": result.technical_analysis,
                "fundamental_analysis": result.fundamental_analysis,
                "risk_warning": result.risk_warning,
            },
            "agent_opinions": getattr(result, "agent_opinions", None),
            "factor_scores": getattr(result, "factor_scores", None),
            "debate_summary": getattr(result, "debate_summary", None),
            "trading_plan": getattr(result, "trading_plan", None),
            "history_comparison": history_comparison,
        }
        
        return {
            "stock_code": result.code,
            "stock_name": stock_name,
            "report": report,
        }
    
    def _build_history_comparison(
        self,
        stock_code: str,
        current_score: int,
        current_advice: str,
        report_language: str = "zh",
    ) -> Optional[Dict[str, Any]]:
        """
        构建与上次分析结果的历史对比数据
        
        Args:
            stock_code: 股票代码
            current_score: 当前评分
            current_advice: 当前操作建议
            report_language: 报告语言
            
        Returns:
            历史对比字典，无历史记录时返回 None
        """
        try:
            history = self.repo.get_list(code=stock_code, days=30, limit=2)
            if not history or len(history) < 1:
                return None
            
            prev = history[0]
            prev_score = getattr(prev, 'sentiment_score', None)
            prev_advice = getattr(prev, 'operation_advice', None)
            prev_created = getattr(prev, 'created_at', None)
            
            if prev_score is None:
                return None
            
            score_change = current_score - prev_score
            if score_change > 0:
                trend = "improving"
            elif score_change < 0:
                trend = "declining"
            else:
                trend = "stable"
            
            localized_current = localize_operation_advice(current_advice, report_language)
            localized_prev = localize_operation_advice(prev_advice, report_language) if prev_advice else None
            advice_changed = False
            if prev_advice and current_advice:
                advice_changed = prev_advice.strip().lower() != current_advice.strip().lower()
            
            backtest = self._build_backtest_result(prev, stock_code, report_language)
            
            return {
                "previous_score": prev_score,
                "score_change": score_change,
                "previous_advice": localized_prev,
                "advice_changed": advice_changed,
                "trend": trend,
                "previous_time": prev_created.isoformat() if prev_created and hasattr(prev_created, 'isoformat') else str(prev_created) if prev_created else None,
                "backtest": backtest,
            }
        except Exception as e:
            logger.debug(f"构建历史对比数据失败: {e}")
            return None
    
    def _build_backtest_result(
        self,
        prev_record: Any,
        stock_code: str,
        report_language: str = "zh",
    ) -> Optional[Dict[str, Any]]:
        """
        构建回测验证数据：如果按上次建议操作，至今收益如何
        
        Args:
            prev_record: 上次分析记录
            stock_code: 股票代码
            report_language: 报告语言
            
        Returns:
            回测结果字典，数据不足时返回 None
        """
        try:
            prev_advice = getattr(prev_record, 'operation_advice', None)
            if not prev_advice:
                return None
            
            advice_lower = prev_advice.strip().lower()
            if advice_lower not in ('buy', '买入', 'strong_buy', '强烈买入'):
                return None
            
            prev_ideal_buy = getattr(prev_record, 'ideal_buy', None)
            prev_stop_loss = getattr(prev_record, 'stop_loss', None)
            prev_take_profit = getattr(prev_record, 'take_profit', None)
            prev_created = getattr(prev_record, 'created_at', None)
            
            if not prev_ideal_buy:
                return None
            
            from src.services.stock_service import StockService
            stock_svc = StockService()
            quote = stock_svc.get_realtime_quote(stock_code)
            
            if not quote or not isinstance(quote.get('current_price'), (int, float)):
                return None
            
            current_price = quote['current_price']
            
            entry_price = prev_ideal_buy
            pnl_pct = round((current_price - entry_price) / entry_price * 100, 2)
            
            hit_stop_loss = False
            hit_take_profit = False
            if prev_stop_loss and isinstance(prev_stop_loss, (int, float)):
                hit_stop_loss = current_price <= prev_stop_loss
            if prev_take_profit and isinstance(prev_take_profit, (int, float)):
                hit_take_profit = current_price >= prev_take_profit
            
            is_en = report_language == 'en'
            if pnl_pct > 0:
                result_label = is_en and "Profit" or "盈利"
            elif pnl_pct < 0:
                result_label = is_en and "Loss" or "亏损"
            else:
                result_label = is_en and "Breakeven" or "持平"
            
            return {
                "entry_price": entry_price,
                "current_price": current_price,
                "pnl_pct": pnl_pct,
                "result_label": result_label,
                "hit_stop_loss": hit_stop_loss,
                "hit_take_profit": hit_take_profit,
                "stop_loss": prev_stop_loss,
                "take_profit": prev_take_profit,
                "advice_time": prev_created.isoformat() if prev_created and hasattr(prev_created, 'isoformat') else None,
            }
        except Exception as e:
            logger.debug(f"构建回测结果失败: {e}")
            return None
