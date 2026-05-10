# -*- coding: utf-8 -*-
"""
Analysis Stream Events — IDE风格实时分析事件系统。

仿照IDE Agent的设计理念，将分析过程中的每一步思考、工具调用、
Agent切换、论证过程都通过事件流实时推送给前端。

事件类型：
- pipeline_start: 分析流水线启动
- agent_start: 某个Agent开始执行
- agent_thinking: Agent正在思考（Sequential Thinking输出）
- agent_tool_call: Agent调用工具
- agent_tool_result: 工具返回结果
- agent_opinion: Agent产出观点
- agent_challenge: 魔鬼代言人提出质疑
- agent_debate_round: 辩论轮次
- agent_scenario: 情景分析结果
- pipeline_complete: 分析流水线完成
- pipeline_error: 分析出错
"""

from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any, Dict, List, Optional


class AnalysisEventType(str, Enum):
    PIPELINE_START = "pipeline_start"
    AGENT_START = "agent_start"
    AGENT_THINKING = "agent_thinking"
    AGENT_TOOL_CALL = "agent_tool_call"
    AGENT_TOOL_RESULT = "agent_tool_result"
    AGENT_OPINION = "agent_opinion"
    AGENT_CHALLENGE = "agent_challenge"
    AGENT_DEBATE_ROUND = "agent_debate_round"
    AGENT_SCENARIO = "agent_scenario"
    PIPELINE_COMPLETE = "pipeline_complete"
    PIPELINE_ERROR = "pipeline_error"
    PROGRESS = "progress"


@dataclass
class AnalysisStreamEvent:
    event_type: AnalysisEventType
    data: Dict[str, Any]
    event_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    timestamp: float = field(default_factory=time.time)

    def to_sse(self) -> str:
        payload = {
            "event_id": self.event_id,
            "event_type": self.event_type.value,
            "timestamp": self.timestamp,
            "data": self.data,
        }
        return f"event: {self.event_type.value}\ndata: {json.dumps(payload, ensure_ascii=False, default=str)}\n\n"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_id": self.event_id,
            "event_type": self.event_type.value,
            "timestamp": self.timestamp,
            "data": self.data,
        }


class AnalysisEventBus:
    """轻量级事件总线，连接Agent执行过程和SSE输出。"""

    def __init__(self):
        self._listeners = []

    def subscribe(self, callback):
        self._listeners.append(callback)

    def unsubscribe(self, callback):
        self._listeners = [l for l in self._listeners if l is not callback]

    def emit(self, event: AnalysisStreamEvent):
        for listener in self._listeners:
            try:
                listener(event)
            except Exception:
                pass

    def emit_pipeline_start(self, stock_code: str, stock_name: str = "", mode: str = "debate", agents: List[str] = None):
        self.emit(AnalysisStreamEvent(
            event_type=AnalysisEventType.PIPELINE_START,
            data={
                "stock_code": stock_code,
                "stock_name": stock_name,
                "mode": mode,
                "agents": agents or [],
                "total_agents": len(agents) if agents else 0,
            },
        ))

    def emit_agent_start(self, agent_name: str, display_name: str = "", step: int = 0, total: int = 0):
        self.emit(AnalysisStreamEvent(
            event_type=AnalysisEventType.AGENT_START,
            data={
                "agent_name": agent_name,
                "display_name": display_name or agent_name,
                "step": step,
                "total_steps": total,
            },
        ))

    def emit_thinking(self, agent_name: str, thinking: str, step: int = 0):
        self.emit(AnalysisStreamEvent(
            event_type=AnalysisEventType.AGENT_THINKING,
            data={
                "agent_name": agent_name,
                "thinking": thinking,
                "step": step,
            },
        ))

    def emit_tool_call(self, agent_name: str, tool_name: str, arguments: Dict[str, Any] = None, step: int = 0):
        self.emit(AnalysisStreamEvent(
            event_type=AnalysisEventType.AGENT_TOOL_CALL,
            data={
                "agent_name": agent_name,
                "tool_name": tool_name,
                "arguments": arguments or {},
                "step": step,
            },
        ))

    def emit_tool_result(self, agent_name: str, tool_name: str, result_summary: str = "", success: bool = True, duration: float = 0):
        self.emit(AnalysisStreamEvent(
            event_type=AnalysisEventType.AGENT_TOOL_RESULT,
            data={
                "agent_name": agent_name,
                "tool_name": tool_name,
                "result_summary": result_summary[:500],
                "success": success,
                "duration": round(duration, 2),
            },
        ))

    def emit_opinion(self, agent_name: str, signal: str, confidence: float, reasoning: str, raw_data: Dict[str, Any] = None):
        self.emit(AnalysisStreamEvent(
            event_type=AnalysisEventType.AGENT_OPINION,
            data={
                "agent_name": agent_name,
                "signal": signal,
                "confidence": confidence,
                "reasoning": reasoning,
                "raw_data": raw_data,
            },
        ))

    def emit_challenge(self, agent_name: str, challenges: List[Dict[str, Any]], weakest_links: List[str], overall_assessment: str = ""):
        self.emit(AnalysisStreamEvent(
            event_type=AnalysisEventType.AGENT_CHALLENGE,
            data={
                "agent_name": agent_name,
                "challenges": challenges,
                "weakest_links": weakest_links,
                "overall_assessment": overall_assessment,
            },
        ))

    def emit_debate_round(self, round_num: int, consensus_points: List[str], divergence_points: List[str], swing_argument: str = ""):
        self.emit(AnalysisStreamEvent(
            event_type=AnalysisEventType.AGENT_DEBATE_ROUND,
            data={
                "round": round_num,
                "consensus_points": consensus_points,
                "divergence_points": divergence_points,
                "swing_argument": swing_argument,
            },
        ))

    def emit_scenario(self, scenarios: Dict[str, Any], expected_value: Dict[str, Any], swing_factors: List[Dict[str, Any]]):
        self.emit(AnalysisStreamEvent(
            event_type=AnalysisEventType.AGENT_SCENARIO,
            data={
                "scenarios": scenarios,
                "expected_value": expected_value,
                "swing_factors": swing_factors,
            },
        ))

    def emit_pipeline_complete(self, stock_code: str, signal: str, confidence: float, duration: float):
        self.emit(AnalysisStreamEvent(
            event_type=AnalysisEventType.PIPELINE_COMPLETE,
            data={
                "stock_code": stock_code,
                "signal": signal,
                "confidence": confidence,
                "duration": round(duration, 2),
            },
        ))

    def emit_error(self, stock_code: str, error: str, agent_name: str = ""):
        self.emit(AnalysisStreamEvent(
            event_type=AnalysisEventType.PIPELINE_ERROR,
            data={
                "stock_code": stock_code,
                "error": error,
                "agent_name": agent_name,
            },
        ))

    def emit_progress(self, message: str, step: int = 0, total: int = 0, percentage: float = 0):
        self.emit(AnalysisStreamEvent(
            event_type=AnalysisEventType.PROGRESS,
            data={
                "message": message,
                "step": step,
                "total": total,
                "percentage": round(percentage, 1),
            },
        ))
