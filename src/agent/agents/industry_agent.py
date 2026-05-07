# -*- coding: utf-8 -*-
"""
IndustryAgent — 行业分析专员。

负责：
- 分析个股所处行业/板块地位与竞争格局
- 研究供应链上下游关系
- 分析板块轮动与行业周期
- 与同行业公司进行对比
- 识别行业催化剂与逆风因素
"""

from __future__ import annotations

import logging
from typing import Optional

from src.agent.agents.base_agent import BaseAgent
from src.agent.protocols import AgentContext, AgentOpinion
from src.agent.runner import try_parse_json

logger = logging.getLogger(__name__)


class IndustryAgent(BaseAgent):
    agent_name = "industry"
    max_steps = 4
    tool_names = [
        "search_comprehensive_intel",
        "get_stock_info",
        "get_sector_rankings",
        "get_market_indices",
    ]

    def system_prompt(self, ctx: AgentContext) -> str:
        return """\
You are an **Industry & Sector Analysis Agent** specialising in A-shares, \
HK, and US equities.

Your task: analyse the stock's industry/sector position, competitive \
landscape, and sector dynamics, then produce a structured JSON opinion.

## Workflow
1. Use get_stock_info to identify the stock's industry and sector
2. Use get_sector_rankings to understand the sector's relative performance \
and rotation status
3. Use get_market_indices to gauge broad market and sector momentum
4. Use search_comprehensive_intel to research supply chain relationships, \
industry catalysts, and competitive dynamics
5. Compare with industry peers and assess competitive positioning

## Analysis Dimensions
- **Industry Cycle**: Determine whether the industry is in growth, mature, \
or decline phase based on revenue trends, policy support, and market \
saturation
- **Competitive Position**: Classify the stock as leader, challenger, or \
follower within its industry based on market share, margins, and innovation
- **Supply Chain**: Analyse upstream (raw materials, suppliers) and \
downstream (customers, end-market) dependencies and pricing power
- **Sector Rotation**: Assess whether capital is flowing into or out of \
the sector based on sector rankings and market indices
- **Peer Comparison**: Compare valuation, growth, and profitability vs. \
direct industry peers

## Output Format
Return **only** a JSON object:
{
  "signal": "strong_buy|buy|hold|sell|strong_sell",
  "confidence": 0.0-1.0,
  "reasoning": "2-3 sentence summary of industry/sector analysis",
  "industry_name": "<industry or sector name>",
  "industry_cycle": "growth|mature|decline",
  "competitive_position": "leader|challenger|follower",
  "supply_chain_analysis": {
    "upstream": "<upstream dependencies and risks>",
    "downstream": "<downstream demand and pricing power>",
    "pricing_power": "strong|moderate|weak"
  },
  "peer_comparison": {
    "peers": ["<peer stock names or codes>"],
    "relative_valuation": "expensive|fair|cheap",
    "relative_growth": "above_average|average|below_average"
  },
  "industry_catalysts": ["list of positive catalysts"],
  "industry_risks": ["list of industry headwinds"],
  "sector_momentum": "accelerating|stable|decelerating"
}
"""

    def build_user_message(self, ctx: AgentContext) -> str:
        parts = [f"Analyse the industry/sector position and competitive landscape for stock **{ctx.stock_code}**"]
        if ctx.stock_name:
            parts[0] += f" ({ctx.stock_name})"
        parts.append(
            "Steps:\n"
            "1. Call get_stock_info to identify the stock's industry and sector.\n"
            "2. Call get_sector_rankings to check sector performance and rotation.\n"
            "3. Call get_market_indices to assess broad market and sector momentum.\n"
            "4. Call search_comprehensive_intel to research supply chain, catalysts, and competitive dynamics.\n"
            "5. Output the JSON opinion."
        )
        return "\n".join(parts)

    def post_process(self, ctx: AgentContext, raw_text: str) -> Optional[AgentOpinion]:
        parsed = try_parse_json(raw_text)
        if parsed is None:
            logger.warning("[IndustryAgent] failed to parse opinion JSON")
            return None

        return AgentOpinion(
            agent_name=self.agent_name,
            signal=parsed.get("signal", "hold"),
            confidence=float(parsed.get("confidence", 0.5)),
            reasoning=parsed.get("reasoning", ""),
            raw_data=parsed,
        )
