# -*- coding: utf-8 -*-
"""
SentimentAgent — A股情绪分析专员。

负责：
- 分析东方财富股吧讨论热度和情绪倾向
- 分析个股热度排名和关注度变化
- 综合新闻情绪与社交媒体情绪
- 量化市场情绪指数
"""

from __future__ import annotations

import logging
from typing import Optional

from src.agent.agents.base_agent import BaseAgent
from src.agent.protocols import AgentContext, AgentOpinion
from src.agent.runner import try_parse_json

logger = logging.getLogger(__name__)


class SentimentAgent(BaseAgent):
    agent_name = "sentiment"
    max_steps = 4
    tool_names = [
        "get_stock_sentiment",
        "search_stock_news",
        "search_comprehensive_intel",
        "get_stock_info",
    ]

    def system_prompt(self, ctx: AgentContext) -> str:
        return """\
You are a **Market Sentiment Analysis Agent** specialising in Chinese A-shares.

Your task: assess market sentiment for the given stock from multiple \
angles — social media discussions, news tone, and attention metrics — \
then produce a structured JSON opinion.

## Workflow
1. Call get_stock_sentiment to fetch guba (股吧) posts and hot ranking data
2. Call search_stock_news to get latest news headlines and assess their tone
3. Call search_comprehensive_intel for broader sentiment context
4. Call get_stock_info for sector context

## Sentiment Assessment Dimensions
- **Guba (股吧) sentiment**: Analyse post titles and content for bullish/\
bearish language. High post volume often signals peak sentiment (contrarian signal).
- **Hot ranking**: High rank = high attention. Extremely high attention near \
tops can be a contrarian sell signal; high attention near bottoms can signal \
capitulation.
- **News tone**: Classify each news item as positive, negative, or neutral. \
Aggregate into overall news sentiment.
- **Attention vs price divergence**: Rising attention + falling price = potential \
capitulation (contrarian buy); Rising attention + rising price = momentum (trend \
confirmation).

## Contrarian Signals
- Extreme bullish consensus → cautious (potential top)
- Extreme bearish consensus → opportunity (potential bottom)
- Low attention + improving fundamentals → under-the-radar opportunity

## Output Format
Return **only** a JSON object:
{
  "signal": "strong_buy|buy|hold|sell|strong_sell",
  "confidence": 0.0-1.0,
  "reasoning": "2-3 sentence summary of sentiment analysis",
  "sentiment_score": 0-100,
  "guba_sentiment": "very_bullish|bullish|neutral|bearish|very_bearish|not_available",
  "news_sentiment": "very_positive|positive|neutral|negative|very_negative",
  "attention_level": "very_high|high|normal|low|very_low",
  "contrarian_signal": "overheated_buy|overheated_sell|capitulation_buy|capitulation_sell|none",
  "sentiment_price_divergence": "bullish_divergence|bearish_divergence|none",
  "key_sentiment_drivers": ["driver 1", "driver 2"]
}
"""

    def build_user_message(self, ctx: AgentContext) -> str:
        parts = [f"Analyze market sentiment for stock **{ctx.stock_code}**"]
        if ctx.stock_name:
            parts[0] += f" ({ctx.stock_name})"
        parts.append(
            "Steps:\n"
            "1. Call get_stock_sentiment for guba posts and hot ranking.\n"
            "2. Call search_stock_news for latest news tone assessment.\n"
            "3. Call search_comprehensive_intel for broader sentiment context.\n"
            "4. Output the JSON opinion with sentiment scores and contrarian signals."
        )
        return "\n".join(parts)

    def post_process(self, ctx: AgentContext, raw_text: str) -> Optional[AgentOpinion]:
        parsed = try_parse_json(raw_text)
        if parsed is None:
            logger.warning("[SentimentAgent] failed to parse opinion JSON")
            return None

        ctx.set_data("sentiment_opinion", parsed)

        return AgentOpinion(
            agent_name=self.agent_name,
            signal=parsed.get("signal", "hold"),
            confidence=float(parsed.get("confidence", 0.5)),
            reasoning=parsed.get("reasoning", ""),
            raw_data=parsed,
        )
