# -*- coding: utf-8 -*-
"""
DebateAgent — 辩论式分析专员。

负责：
- 汇总各 Agent 的分析观点
- 模拟多 Agent 之间的观点辩论与质疑
- 发现分析盲点和分歧
- 达成团队共识
- 生成可执行的操盘方案
"""

from __future__ import annotations

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
You are a **Debate Moderator & Consensus Agent** for a multi-analyst \
investment team.

You will receive structured opinions from multiple specialist agents:
- **Technical Agent**: trend, momentum, support/resistance analysis
- **Intel Agent**: news, sentiment, capital flow intelligence
- **Risk Agent**: risk screening and red-flag detection
- **Industry Agent** (if available): sector position, competitive landscape
- **Capital Flow Agent** (if available): main-force fund flow, smart money signals

Your task: simulate a professional investment committee debate, then \
produce a consensus decision with a concrete trading plan.

## Debate Process
1. **Identify disagreements**: Where do agents disagree on signal or \
confidence? Highlight these divergences explicitly.
2. **Challenge weak arguments**: For each agent's opinion, identify \
potential blind spots or overconfidence. Play devil's advocate.
3. **Weight by expertise**: Technical and capital flow opinions carry \
more weight for short-term timing; industry and intel opinions carry \
more weight for medium-term direction; risk opinions can veto buy signals.
4. **Resolve conflicts**: When agents disagree, explain which argument \
is more convincing and why.
5. **Reach consensus**: Produce a unified team opinion with clear reasoning.

## Trading Plan Requirements
Generate a detailed, actionable trading plan:
- **Entry strategy**: specific price levels and position sizing (分批建仓)
- **Profit targets**: at least 2 price targets with partial exit levels
- **Stop-loss levels**: technical stop, time stop, and fundamental stop
- **Position management**: initial size, maximum size, review schedule

## Output Format
Return **only** a JSON object:
{
  "signal": "strong_buy|buy|hold|sell|strong_sell",
  "confidence": 0.0-1.0,
  "reasoning": "consensus reasoning after debate",
  "debate_summary": {
    "consensus_points": ["points all agents agree on"],
    "divergence_points": ["points where agents disagree"],
    "key_debates": [
      {"topic": "...", "bullish_argument": "...", "bearish_argument": "...", "resolution": "..."}
    ],
    "blind_spots_identified": ["potential blind spots in the analysis"]
  },
  "trading_plan": {
    "entry_strategy": {
      "method": "分批建仓|一次性|观望",
      "batches": [
        {"condition": "...", "position_pct": 30, "price_level": 0.0}
      ]
    },
    "profit_targets": [
      {"price_level": 0.0, "action": "止盈30%", "condition": "..."}
    ],
    "stop_loss": {
      "technical_stop": 0.0,
      "time_stop": "持有超过N天无起色",
      "fundamental_stop": "基本面恶化条件"
    },
    "position_management": {
      "initial_position_pct": 30,
      "max_position_pct": 100,
      "review_frequency": "每周"
    }
  },
  "risk_control": [
    "单只股票不超过总资产20%",
    "严格执行止损纪律"
  ]
}
"""

    def build_user_message(self, ctx: AgentContext) -> str:
        parts = [f"Conduct a debate analysis for stock **{ctx.stock_code}**"]
        if ctx.stock_name:
            parts[0] += f" ({ctx.stock_name})"

        opinion_summaries = []
        for opinion in ctx.opinions:
            summary = (
                f"- **{opinion.agent_name}**: signal={opinion.signal}, "
                f"confidence={opinion.confidence:.2f}, "
                f"reasoning={opinion.reasoning}"
            )
            if opinion.raw_data:
                extra_keys = [k for k in opinion.raw_data if k not in ("signal", "confidence", "reasoning")]
                if extra_keys:
                    summary += f", extra_fields={extra_keys}"
            opinion_summaries.append(summary)

        if opinion_summaries:
            parts.append("\n## Agent Opinions Received:\n" + "\n".join(opinion_summaries))
        else:
            parts.append("\nNo prior agent opinions available. Provide a balanced analysis based on available data.")

        if ctx.risk_flags:
            risk_items = [f"  - [{r.get('severity', '?')}] {r.get('category', '?')}: {r.get('description', '')}" for r in ctx.risk_flags]
            parts.append("\n## Risk Flags:\n" + "\n".join(risk_items))

        parts.append(
            "\nNow simulate the investment committee debate, resolve disagreements, "
            "and produce the consensus JSON with a detailed trading plan."
        )
        return "\n".join(parts)

    def post_process(self, ctx: AgentContext, raw_text: str) -> Optional[AgentOpinion]:
        parsed = try_parse_json(raw_text)
        if parsed is None:
            logger.warning("[DebateAgent] failed to parse opinion JSON")
            return None

        ctx.set_data("debate_opinion", parsed)
        ctx.set_data("trading_plan", parsed.get("trading_plan", {}))

        return AgentOpinion(
            agent_name=self.agent_name,
            signal=parsed.get("signal", "hold"),
            confidence=float(parsed.get("confidence", 0.5)),
            reasoning=parsed.get("reasoning", ""),
            raw_data=parsed,
        )
