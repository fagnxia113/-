# -*- coding: utf-8 -*-
"""
ScenarioAnalysisAgent — 情景分析专员。

职责：
- 构建牛/熊/中性三种情景，每种情景给出概率和关键假设
- 识别每种情景的触发条件和失效条件
- 评估当前价格在不同情景下的合理估值
- 计算期望收益和风险收益比
- 识别关键变量（swing factor）：哪个变量最可能改变情景概率
"""

from __future__ import annotations

import logging
from typing import Optional

from src.agent.agents.base_agent import BaseAgent
from src.agent.protocols import AgentContext, AgentOpinion
from src.agent.runner import try_parse_json

logger = logging.getLogger(__name__)


class ScenarioAnalysisAgent(BaseAgent):
    agent_name = "scenario_analysis"
    max_steps = 3
    tool_names = []

    def system_prompt(self, ctx: AgentContext) -> str:
        return """\
You are a **Scenario Analysis Agent** specialising in multi-scenario \
investment modeling for Chinese A-shares.

Your task: construct three plausible scenarios (bull, bear, base) for the \
stock, each with probability weights, key assumptions, trigger conditions, \
and price targets. Then compute expected value and risk-reward metrics.

## Scenario Construction Principles

### 1. Base Case (概率最高)
- The most probable outcome given current information
- Assumes trends continue but at a moderate pace
- Neither overly optimistic nor pessimistic
- Must be internally consistent across all data dimensions

### 2. Bull Case (乐观情景)
- What needs to go RIGHT for the stock to outperform significantly
- Must identify SPECIFIC catalysts, not just "market goes up"
- Probability should reflect realistic chance, not wishful thinking
- Price target based on comparable valuation expansion or earnings growth

### 3. Bear Case (悲观情景)
- What could go WRONG — systematically
- Must identify SPECIFIC triggers, not just "market goes down"
- Consider tail risks identified by the Devil's Advocate
- Price target based on comparable valuation compression or earnings decline

## Key Requirements
- Each scenario must have a CLEAR trigger condition
- Each scenario must state what would INVALIDATE it
- Probabilities must sum to 1.0 (100%)
- Price targets must be justified by specific valuation or technical levels
- The swing factor analysis must identify which variable most affects the outcome

## Output Format
Return **only** a JSON object:
{
  "signal": "strong_buy|buy|hold|sell|strong_sell",
  "confidence": 0.0-1.0,
  "reasoning": "1-2 sentence summary of scenario analysis conclusion",
  "scenarios": {
    "bull": {
      "probability": 0.0-1.0,
      "price_target": 0.0,
      "return_pct": 0.0,
      "key_assumptions": ["assumption 1", "assumption 2"],
      "catalysts": ["specific catalyst 1", "specific catalyst 2"],
      "trigger_condition": "what needs to happen for this scenario",
      "invalidation_condition": "what would rule out this scenario",
      "time_horizon": "1-3 months"
    },
    "base": {
      "probability": 0.0-1.0,
      "price_target": 0.0,
      "return_pct": 0.0,
      "key_assumptions": ["assumption 1", "assumption 2"],
      "catalysts": [],
      "trigger_condition": "",
      "invalidation_condition": "",
      "time_horizon": "1-3 months"
    },
    "bear": {
      "probability": 0.0-1.0,
      "price_target": 0.0,
      "return_pct": 0.0,
      "key_assumptions": ["assumption 1", "assumption 2"],
      "catalysts": ["specific risk trigger 1", "specific risk trigger 2"],
      "trigger_condition": "what needs to happen for this scenario",
      "invalidation_condition": "what would rule out this scenario",
      "time_horizon": "1-3 months"
    }
  },
  "expected_value": {
    "expected_return_pct": 0.0,
    "risk_reward_ratio": 0.0,
    "upside_downside_ratio": 0.0,
    "break_even_probability": 0.0
  },
  "swing_factors": [
    {
      "factor": "the single most important variable",
      "current_status": "current state of this factor",
      "bull_implication": "if factor turns positive",
      "bear_implication": "if factor turns negative",
      "monitoring_signal": "what to watch for changes"
    }
  ],
  "scenario_conflicts": [
    "any contradictions between scenarios and agent opinions"
  ],
  "recommended_position_sizing": "aggressive|moderate|conservative|minimal",
  "key_monitoring_points": [
    "what to watch going forward to determine which scenario is playing out"
  ]
}
"""

    def build_user_message(self, ctx: AgentContext) -> str:
        parts = [f"Perform scenario analysis for stock **{ctx.stock_code}**"]
        if ctx.stock_name:
            parts[0] += f" ({ctx.stock_name})"

        opinion_summaries = []
        for opinion in ctx.opinions:
            summary = (
                f"- **{opinion.agent_name}**: signal={opinion.signal}, "
                f"confidence={opinion.confidence:.2f}, "
                f"reasoning={opinion.reasoning}"
            )
            opinion_summaries.append(summary)

        if opinion_summaries:
            parts.append("\n## Agent Opinions:\n" + "\n".join(opinion_summaries))

        devils_advocate_audit = ctx.get_data("devils_advocate_audit")
        if devils_advocate_audit and isinstance(devils_advocate_audit, dict):
            import json
            audit_summary = {
                "overall_assessment": devils_advocate_audit.get("overall_assessment"),
                "weakest_links": devils_advocate_audit.get("weakest_links", []),
                "what_could_go_wrong": devils_advocate_audit.get("what_could_go_wrong", []),
                "bias_audit": devils_advocate_audit.get("bias_audit", {}),
            }
            parts.append(
                "\n## Devil's Advocate Audit:\n"
                + json.dumps(audit_summary, ensure_ascii=False, indent=2)
            )

        debate_opinion = ctx.get_data("debate_opinion")
        if debate_opinion and isinstance(debate_opinion, dict):
            import json
            debate_summary = {
                "consensus_points": debate_opinion.get("debate_summary", {}).get("consensus_points", []),
                "divergence_points": debate_opinion.get("debate_summary", {}).get("divergence_points", []),
                "trading_plan": debate_opinion.get("trading_plan", {}),
            }
            parts.append(
                "\n## Debate Consensus:\n"
                + json.dumps(debate_summary, ensure_ascii=False, indent=2)
            )

        if ctx.risk_flags:
            risk_items = [f"  - [{r.get('severity', '?')}] {r.get('category', '?')}: {r.get('description', '')}" for r in ctx.risk_flags]
            parts.append("\n## Risk Flags:\n" + "\n".join(risk_items))

        parts.append(
            "\nNow construct three scenarios (bull/base/bear) with probabilities, "
            "price targets, trigger conditions, and swing factors. "
            "Be specific — vague scenarios are useless for decision-making."
        )
        return "\n".join(parts)

    def post_process(self, ctx: AgentContext, raw_text: str) -> Optional[AgentOpinion]:
        parsed = try_parse_json(raw_text)
        if parsed is None:
            logger.warning("[ScenarioAnalysisAgent] failed to parse opinion JSON")
            return None

        ctx.set_data("scenario_analysis", parsed)
        ctx.set_data("scenarios", parsed.get("scenarios", {}))
        ctx.set_data("expected_value", parsed.get("expected_value", {}))
        ctx.set_data("swing_factors", parsed.get("swing_factors", []))

        return AgentOpinion(
            agent_name=self.agent_name,
            signal=parsed.get("signal", "hold"),
            confidence=float(parsed.get("confidence", 0.5)),
            reasoning=parsed.get("reasoning", ""),
            raw_data=parsed,
        )
