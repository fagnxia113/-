from __future__ import annotations

import logging
from typing import Any, Dict

from .registry import ToolDefinition, ToolParameter

logger = logging.getLogger(__name__)


class SequentialThinkingExecutor:
    """Execute sequential_thinking tool calls."""

    def __init__(self, event_bus=None, agent_name: str = ""):
        self.event_bus = event_bus
        self.agent_name = agent_name
        self._steps = []

    def execute(self, **kwargs) -> Dict[str, Any]:
        step_number = kwargs.get("step_number", 0)
        step_title = kwargs.get("step_title", "")
        content = kwargs.get("content", "")
        evidence_type = kwargs.get("evidence_type", "soft_evidence")
        confidence = kwargs.get("confidence", 0.5)
        next_step_needed = kwargs.get("next_step_needed", True)

        step_record = {
            "step": step_number,
            "title": step_title,
            "content": content[:1000],
            "evidence_type": evidence_type,
            "confidence": confidence,
            "next_step_needed": next_step_needed,
        }
        self._steps.append(step_record)

        if self.event_bus:
            self.event_bus.emit_thinking(
                agent_name=self.agent_name,
                thinking=f"[Step {step_number}] {step_title}: {content[:200]}",
                step=step_number,
            )

        total_steps = len(self._steps)
        return {
            "step_recorded": True,
            "step_number": step_number,
            "total_steps_so_far": total_steps,
            "next_step_needed": next_step_needed,
            "message": (
                f"Step {step_number} recorded. "
                + ("Continue with next step." if next_step_needed else "Thinking complete. You may now provide your final conclusion.")
            ),
        }

    def get_all_steps(self) -> list:
        return list(self._steps)

    def reset(self):
        self._steps = []


def register_sequential_thinking(tool_registry, event_bus=None, agent_name: str = ""):
    """Register the sequential_thinking tool with a ToolRegistry."""
    executor = SequentialThinkingExecutor(event_bus=event_bus, agent_name=agent_name)

    tool_def = ToolDefinition(
        name="sequential_thinking",
        description=(
            "Structured thinking tool for deep analysis. Use this to organize your reasoning "
            "step by step before reaching a conclusion. Each call records one thinking step. "
            "You MUST use this tool to show your reasoning process."
        ),
        parameters=[
            ToolParameter(name="step_number", type="integer", description="The current thinking step number (1, 2, 3...)"),
            ToolParameter(name="step_title", type="string", description="Short title for this thinking step"),
            ToolParameter(name="content", type="string", description="The detailed reasoning content for this step"),
            ToolParameter(name="evidence_type", type="string", description="Classification of the evidence", required=False, enum=["hard_evidence", "soft_evidence", "speculation", "data_gap"]),
            ToolParameter(name="confidence", type="number", description="Your confidence in this step (0.0-1.0)", required=False),
            ToolParameter(name="next_step_needed", type="boolean", description="Whether more thinking steps are needed after this one"),
        ],
        handler=executor.execute,
        category="analysis",
    )
    tool_registry.register(tool_def)
    return executor
