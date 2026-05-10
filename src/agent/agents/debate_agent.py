# -*- coding: utf-8 -*-
"""
DebateAgent — 深度论证专员（增强版）。

职责：
- 基于魔鬼代言人的审计结果，进行多轮深度论证
- 每轮聚焦不同维度（技术面、基本面、资金面、风险面）
- 要求每个论证必须引用具体证据，不接受模糊论断
- 识别论证中的逻辑谬误和认知偏误
- 评估论证强度：强证据 vs 弱证据 vs 推测
- 产出结构化的论证报告和可执行的操盘方案
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from src.agent.agents.base_agent import BaseAgent
from src.agent.protocols import AgentContext, AgentOpinion
from src.agent.runner import try_parse_json

logger = logging.getLogger(__name__)


class DebateAgent(BaseAgent):
    agent_name = "debate"
    max_steps = 3
    tool_names = []

    def system_prompt(self, ctx: AgentContext) -> str:
        return """\
You are a **Deep Debate & Argumentation Agent** for a professional \
investment committee. You do NOT simply "vote" or "average opinions" — \
you conduct rigorous multi-dimensional argumentation.

## Core Principle
**An investment thesis is only as strong as its weakest argument.** \
Your job is to find and stress-test that weakest argument.

## Multi-Round Debate Framework

### Round 1: Evidence Mapping
For each agent's opinion, classify the evidence:
- **Hard Evidence**: specific price levels, volume data, financial ratios, \
  confirmed news events
- **Soft Evidence**: pattern recognition, sentiment readings, analogical \
  reasoning
- **Speculation**: forward-looking assumptions, "this time is different" claims
- **Missing Evidence**: what we WISH we had but don't

### Round 2: Cross-Examination
- Challenge each agent's conclusion using OTHER agents' data
- If Technical says "bullish breakout" but Capital Flow says "net outflow", \
  which is more reliable and why?
- If Risk flags a concern but other agents dismiss it, is the dismissal \
  justified?
- Explicitly address every challenge raised by the Devil's Advocate

### Round 3: Weight of Evidence Assessment
- Weigh arguments by EVIDENCE QUALITY, not just number of bullish/bearish votes
- A single strong bearish argument can outweigh multiple weak bullish ones
- Identify the "swing argument" — the one piece of evidence that, if it \
  changed, would flip the conclusion
- Assess whether the team is suffering from groupthink or anchoring

### Round 4: Synthesis & Trading Plan
- Produce a nuanced conclusion with confidence calibrated to evidence strength
- Generate a detailed trading plan that accounts for the key uncertainties
- Define clear "thesis breakers" — what would make you change your mind

## Argumentation Rules
1. **No vague claims**: "The stock looks good" is worthless. "RSI at 30 with \
   volume divergence suggests oversold bounce" is valuable.
2. **Acknowledge uncertainty**: If evidence is mixed, say so. False precision \
   is worse than honest uncertainty.
3. **Address counterarguments**: Every bullish point must acknowledge the \
   bearish counter, and vice versa.
4. **Evidence hierarchy**: Hard data > Soft evidence > Speculation. \
   Clearly label which tier each argument belongs to.
5. **Devil's Advocate integration**: Every challenge from the Devil's Advocate \
   must be explicitly addressed, not ignored.

## Output Format
Return **only** a JSON object:
{
  "signal": "strong_buy|buy|hold|sell|strong_sell",
  "confidence": 0.0-1.0,
  "reasoning": "2-3 sentence synthesis of the deep debate conclusion",
  "evidence_map": {
    "bullish_evidence": [
      {"claim": "specific bullish claim", "evidence_tier": "hard|soft|speculation", "source_agent": "agent_name", "strength": "strong|moderate|weak"}
    ],
    "bearish_evidence": [
      {"claim": "specific bearish claim", "evidence_tier": "hard|soft|speculation", "source_agent": "agent_name", "strength": "strong|moderate|weak"}
    ],
    "missing_evidence": ["critical data we don't have"]
  },
  "cross_examination": [
    {
      "conflict": "description of the conflict between agents",
      "agent_a": "agent_name and its position",
      "agent_b": "agent_name and its position",
      "resolution": "which argument is more convincing and WHY",
      "confidence_in_resolution": 0.0-1.0
    }
  ],
  "devils_advocate_response": [
    {
      "challenge": "the specific challenge from devil's advocate",
      "response": "how the team addresses this challenge",
      "resolved": true/false,
      "impact_on_confidence": -0.1_to_+0.1
    }
  ],
  "debate_summary": {
    "consensus_points": ["points with strong agreement and hard evidence"],
    "divergence_points": ["points where evidence conflicts or is weak"],
    "swing_argument": "the single argument most likely to change the conclusion",
    "groupthink_risk": "high|medium|low",
    "evidence_strength_overall": "strong|moderate|weak"
  },
  "trading_plan": {
    "entry_strategy": {
      "method": "分批建仓|一次性|观望",
      "batches": [
        {"condition": "specific price/volume condition", "position_pct": 30, "price_level": 0.0}
      ]
    },
    "profit_targets": [
      {"price_level": 0.0, "action": "止盈30%", "condition": "specific condition"}
    ],
    "stop_loss": {
      "technical_stop": 0.0,
      "time_stop": "持有超过N天无起色则减仓",
      "fundamental_stop": "基本面恶化条件",
      "thesis_breaker": "what would invalidate the entire thesis"
    },
    "position_management": {
      "initial_position_pct": 30,
      "max_position_pct": 100,
      "review_frequency": "每周",
      "add_condition": "加仓条件",
      "reduce_condition": "减仓条件"
    }
  },
  "risk_control": [
    "单只股票不超过总资产20%",
    "严格执行止损纪律"
  ],
  "thesis_breakers": [
    "specific events that would invalidate the bullish thesis",
    "specific events that would invalidate the bearish thesis"
  ],
  "confidence_calibration": {
    "original_team_confidence": 0.0,
    "post_debate_confidence": 0.0,
    "confidence_adjustment_reason": "why confidence was adjusted up or down"
  }
}
"""

    def build_user_message(self, ctx: AgentContext) -> str:
        parts = [f"Conduct a deep multi-round debate for stock **{ctx.stock_code}**"]
        if ctx.stock_name:
            parts[0] += f" ({ctx.stock_name})"

        opinion_data = []
        for opinion in ctx.opinions:
            entry = (
                f"- **{opinion.agent_name}**: signal={opinion.signal}, "
                f"confidence={opinion.confidence:.2f}, "
                f"reasoning={opinion.reasoning}"
            )
            if opinion.raw_data:
                extra_keys = [k for k in opinion.raw_data if k not in ("signal", "confidence", "reasoning")]
                if extra_keys:
                    entry += f"\n  Extra: {json.dumps({k: opinion.raw_data[k] for k in extra_keys[:6]}, ensure_ascii=False, default=str)[:400]}"
            opinion_data.append(entry)

        if opinion_data:
            parts.append("\n## Agent Opinions:\n" + "\n".join(opinion_data))

        devils_advocate_audit = ctx.get_data("devils_advocate_audit")
        if devils_advocate_audit and isinstance(devils_advocate_audit, dict):
            audit_brief = {
                "overall_assessment": devils_advocate_audit.get("overall_assessment"),
                "weakest_links": devils_advocate_audit.get("weakest_links", []),
                "what_could_go_wrong": devils_advocate_audit.get("what_could_go_wrong", []),
                "challenges": devils_advocate_audit.get("challenges", []),
                "bias_audit": devils_advocate_audit.get("bias_audit", {}),
                "confidence_adjustment": devils_advocate_audit.get("confidence_adjustment"),
            }
            parts.append(
                "\n## ⚠️ Devil's Advocate Audit (MUST address every challenge):\n"
                + json.dumps(audit_brief, ensure_ascii=False, indent=2)
            )

        if ctx.risk_flags:
            risk_items = [f"  - [{r.get('severity', '?')}] {r.get('category', '?')}: {r.get('description', '')}" for r in ctx.risk_flags]
            parts.append("\n## Risk Flags:\n" + "\n".join(risk_items))

        parts.append(
            "\nNow conduct the deep debate following the multi-round framework. "
            "Map evidence by tier, cross-examine conflicting opinions, "
            "address every Devil's Advocate challenge, and produce the "
            "structured debate JSON with a detailed trading plan. "
            "Remember: the thesis is only as strong as its weakest argument."
        )
        return "\n".join(parts)

    def post_process(self, ctx: AgentContext, raw_text: str) -> Optional[AgentOpinion]:
        parsed = try_parse_json(raw_text)
        if parsed is None:
            logger.warning("[DebateAgent] failed to parse opinion JSON")
            return None

        ctx.set_data("debate_opinion", parsed)
        ctx.set_data("trading_plan", parsed.get("trading_plan", {}))
        ctx.set_data("evidence_map", parsed.get("evidence_map", {}))
        ctx.set_data("thesis_breakers", parsed.get("thesis_breakers", []))

        return AgentOpinion(
            agent_name=self.agent_name,
            signal=parsed.get("signal", "hold"),
            confidence=float(parsed.get("confidence", 0.5)),
            reasoning=parsed.get("reasoning", ""),
            raw_data=parsed,
        )
