# -*- coding: utf-8 -*-
"""
FactorScoringAgent — 量化因子评分专员。

负责：
- 从各 Agent 的分析结果中提取量化因子
- 对技术面、基本面、情绪面、资金面四维打分
- 加权合成综合评分
- 输出结构化评分卡
"""

from __future__ import annotations

import logging
from typing import Dict, Optional

from src.agent.agents.base_agent import BaseAgent
from src.agent.protocols import AgentContext, AgentOpinion
from src.agent.runner import try_parse_json

logger = logging.getLogger(__name__)

_FACTOR_WEIGHTS = {
    "technical": 0.30,
    "fundamental": 0.25,
    "sentiment": 0.20,
    "capital_flow": 0.25,
}

_SIGNAL_SCORE_MAP = {
    "strong_buy": 100,
    "buy": 75,
    "hold": 50,
    "sell": 25,
    "strong_sell": 0,
}


def _score_signal(signal: str) -> float:
    normalized = (signal or "hold").strip().lower()
    return float(_SIGNAL_SCORE_MAP.get(normalized, 50))


def _compute_composite(scores: Dict[str, float], weights: Dict[str, float]) -> float:
    total_weight = sum(weights.values()) or 1.0
    return sum(scores.get(k, 50.0) * weights.get(k, 0.0) for k in weights) / total_weight


class FactorScoringAgent(BaseAgent):
    agent_name = "factor_scoring"
    max_steps = 2
    tool_names = []

    def system_prompt(self, ctx: AgentContext) -> str:
        return """\
You are a **Quantitative Factor Scoring Agent** that produces a multi-\
dimensional scorecard for the given stock.

You will receive structured opinions from specialist agents. Your task: \
extract quantitative signals from each opinion, assign dimension scores \
(0-100), and compute a weighted composite score.

## Scoring Dimensions

### Technical Score (weight: 30%)
Based on: trend direction, MA alignment, RSI level, MACD signal, volume \
confirmation, chart pattern, support/resistance proximity.

### Fundamental Score (weight: 20%)
Based on: industry cycle position, competitive position, valuation \
relative to peers, growth trajectory, earnings quality, DuPont profile, \
financial ratio health (if FundamentalAgent opinion is available, use its \
profitability/solvency/growth/valuation scores as primary input).

### Sentiment Score (weight: 15%)
Based on: news sentiment, analyst outlook, market mood, risk alerts \
(inverse — more risk alerts = lower score), catalyst potential, guba \
sentiment, hot ranking attention (if SentimentAgent opinion is available, \
use its sentiment_score and contrarian_signal as primary input).

### Capital Flow Score (weight: 25%)
Based on: main-force net flow direction, smart money signal, accumulation/\
distribution stage, volume-price relationship, margin dynamics.

## Composite Score
Weighted average of the four dimension scores using the weights above.

## Score Interpretation
- 80-100: Strong bullish (强烈看多)
- 60-79: Moderately bullish (偏多)
- 40-59: Neutral (中性)
- 20-39: Moderately bearish (偏空)
- 0-19: Strong bearish (强烈看空)

## Output Format
Return **only** a JSON object:
{
  "signal": "strong_buy|buy|hold|sell|strong_sell",
  "confidence": 0.0-1.0,
  "reasoning": "1-2 sentence summary of the scorecard",
  "scores": {
    "technical": 0-100,
    "fundamental": 0-100,
    "sentiment": 0-100,
    "capital_flow": 0-100,
    "composite": 0-100
  },
  "score_details": {
    "technical": {
      "trend": 0-100,
      "momentum": 0-100,
      "volume": 0-100,
      "pattern": 0-100
    },
    "fundamental": {
      "industry_cycle": 0-100,
      "competitive_position": 0-100,
      "valuation": 0-100,
      "growth": 0-100
    },
    "sentiment": {
      "news_sentiment": 0-100,
      "risk_level": 0-100,
      "catalyst_potential": 0-100
    },
    "capital_flow": {
      "main_force": 0-100,
      "smart_money": 0-100,
      "accumulation": 0-100,
      "volume_price": 0-100
    }
  },
  "composite_interpretation": "强烈看多|偏多|中性|偏空|强烈看空",
  "key_strengths": ["top 2-3 strengths"],
  "key_weaknesses": ["top 2-3 weaknesses"],
  "dimension_conflicts": ["any conflicts between dimensions, e.g. technical bullish but fundamental bearish"]
}
"""

    def build_user_message(self, ctx: AgentContext) -> str:
        parts = [f"Generate a quantitative factor scorecard for stock **{ctx.stock_code}**"]
        if ctx.stock_name:
            parts[0] += f" ({ctx.stock_name})"

        opinion_data = {}
        for opinion in ctx.opinions:
            opinion_data[opinion.agent_name] = {
                "signal": opinion.signal,
                "confidence": opinion.confidence,
                "reasoning": opinion.reasoning,
            }
            if opinion.raw_data:
                for k, v in opinion.raw_data.items():
                    if k not in opinion_data[opinion.agent_name]:
                        opinion_data[opinion.agent_name][k] = v

        if opinion_data:
            import json
            parts.append(
                "\n## Agent Opinions for Scoring:\n"
                + json.dumps(opinion_data, ensure_ascii=False, indent=2)
            )

        parts.append(
            "\nExtract quantitative signals from each agent's opinion, "
            "assign dimension scores, and output the scorecard JSON."
        )
        return "\n".join(parts)

    def post_process(self, ctx: AgentContext, raw_text: str) -> Optional[AgentOpinion]:
        parsed = try_parse_json(raw_text)
        if parsed is None:
            logger.warning("[FactorScoringAgent] failed to parse opinion JSON")
            return None

        ctx.set_data("factor_scores", parsed.get("scores", {}))
        ctx.set_data("factor_score_details", parsed.get("score_details", {}))

        return AgentOpinion(
            agent_name=self.agent_name,
            signal=parsed.get("signal", "hold"),
            confidence=float(parsed.get("confidence", 0.5)),
            reasoning=parsed.get("reasoning", ""),
            raw_data=parsed,
        )
