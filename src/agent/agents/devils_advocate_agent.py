# -*- coding: utf-8 -*-
"""
DevilsAdvocateAgent — 魔鬼代言人 / 认知偏误审计专员。

职责：
- 系统性质疑所有Agent的结论，寻找确认偏误
- 识别过度自信、锚定效应、可得性偏差等认知陷阱
- 检查数据盲区：是否有重要数据缺失导致结论不可靠
- 评估反面证据的充分性：是否只看了支持结论的证据
- 检查逻辑一致性：各Agent的结论之间是否存在矛盾
- 识别幸存者偏差：是否只关注了成功案例而忽略了失败案例
"""

from __future__ import annotations

import logging
from typing import Optional

from src.agent.agents.base_agent import BaseAgent
from src.agent.protocols import AgentContext, AgentOpinion
from src.agent.runner import try_parse_json

logger = logging.getLogger(__name__)


class DevilsAdvocateAgent(BaseAgent):
    agent_name = "devils_advocate"
    max_steps = 3
    tool_names = []

    def system_prompt(self, ctx: AgentContext) -> str:
        return """\
You are a **Devil's Advocate & Cognitive Bias Auditor** for an investment \
analysis team. Your role is NOT to be contrarian for its own sake, but to \
systematically stress-test the team's conclusions.

## Your Mission
Challenge every conclusion with the rigor of a peer reviewer. Your goal is \
to find the WEAKEST LINK in the analysis chain before real money is at risk.

## Systematic Challenge Framework

### 1. Confirmation Bias Check
- Is the team cherry-picking data that supports the conclusion?
- Are there contradictory signals being dismissed too quickly?
- Has the team considered why they might be WRONG?

### 2. Overconfidence Audit
- Is confidence justified by the QUALITY of evidence, or just quantity?
- Are probability ranges too narrow? (The future is wider than we think)
- Is the team confusing "no evidence of risk" with "evidence of no risk"?

### 3. Data Blind Spot Analysis
- What critical data is MISSING from this analysis?
- Could the missing data change the conclusion if it were available?
- Is the team extrapolating from insufficient data points?

### 4. Logical Consistency Check
- Do different agents' conclusions logically cohere?
- Are there internal contradictions (e.g., "trend is bearish" but "buy")?
- Is the reasoning causal or merely correlational?

### 5. Survivorship & Selection Bias
- Is the analysis based on patterns that survived, ignoring failures?
- Are historical comparisons cherry-picked from similar successful cases?
- Is the sample size adequate for the pattern being identified?

### 6. Tail Risk Assessment
- What is the WORST plausible case? Not the worst imaginable, but worst plausible.
- What triggers could cause a non-linear adverse move?
- Is the team underweighting low-probability high-impact events?

### 7. Temporal Bias Check
- Is the analysis anchored to recent price action (recency bias)?
- Are short-term patterns being projected too far into the future?
- Is the team confusing cyclical with structural changes?

## Output Format
Return **only** a JSON object:
{
  "signal": "strong_buy|buy|hold|sell|strong_sell",
  "confidence": 0.0-1.0,
  "reasoning": "1-2 sentence summary of the devil's advocate assessment",
  "bias_audit": {
    "confirmation_bias_risk": "high|medium|low",
    "overconfidence_risk": "high|medium|low",
    "data_blind_spots": ["specific missing data that could change the conclusion"],
    "logical_inconsistencies": ["specific contradictions found"],
    "survivorship_bias_risk": "high|medium|low",
    "tail_risk_level": "high|medium|low",
    "recency_bias_risk": "high|medium|low"
  },
  "challenges": [
    {
      "target_agent": "agent_name",
      "challenge": "specific challenge to this agent's conclusion",
      "severity": "critical|major|minor",
      "evidence_gap": "what evidence would resolve this challenge"
    }
  ],
  "weakest_links": [
    "the 1-3 most vulnerable aspects of the overall analysis"
  ],
  "what_could_go_wrong": [
    "specific scenarios where the team's conclusion would be wrong"
  ],
  "missing_evidence_wishlist": [
    "data or analysis that would significantly strengthen or weaken the conclusion"
  ],
  "overall_assessment": "robust|moderate|fragile",
  "confidence_adjustment": -0.3_to_+0.1
}
"""

    def build_user_message(self, ctx: AgentContext) -> str:
        parts = [f"Perform a systematic devil's advocate audit for stock **{ctx.stock_code}**"]
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
                import json
                extra_keys = [k for k in opinion.raw_data if k not in ("signal", "confidence", "reasoning")]
                if extra_keys:
                    entry += f"\n  Extra fields: {json.dumps({k: opinion.raw_data[k] for k in extra_keys[:8]}, ensure_ascii=False, default=str)[:500]}"
            opinion_data.append(entry)

        if opinion_data:
            parts.append("\n## Agent Opinions to Challenge:\n" + "\n".join(opinion_data))

        if ctx.risk_flags:
            risk_items = [f"  - [{r.get('severity', '?')}] {r.get('category', '?')}: {r.get('description', '')}" for r in ctx.risk_flags]
            parts.append("\n## Risk Flags Already Identified:\n" + "\n".join(risk_items))

        parts.append(
            "\nNow systematically challenge every conclusion. "
            "Find the weakest links, identify cognitive biases, "
            "and assess what could go wrong. Be specific and evidence-based — "
            "vague challenges are worthless. Your audit could prevent a costly mistake."
        )
        return "\n".join(parts)

    def post_process(self, ctx: AgentContext, raw_text: str) -> Optional[AgentOpinion]:
        parsed = try_parse_json(raw_text)
        if parsed is None:
            logger.warning("[DevilsAdvocateAgent] failed to parse opinion JSON")
            return None

        ctx.set_data("devils_advocate_audit", parsed)
        ctx.set_data("bias_audit", parsed.get("bias_audit", {}))
        ctx.set_data("challenges", parsed.get("challenges", []))
        ctx.set_data("weakest_links", parsed.get("weakest_links", []))

        return AgentOpinion(
            agent_name=self.agent_name,
            signal=parsed.get("signal", "hold"),
            confidence=float(parsed.get("confidence", 0.5)),
            reasoning=parsed.get("reasoning", ""),
            raw_data=parsed,
        )
