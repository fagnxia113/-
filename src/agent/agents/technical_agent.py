# -*- coding: utf-8 -*-
"""
TechnicalAgent — technical & price analysis specialist.

Responsible for:
- Fetching realtime quotes and historical K-line data
- Running technical indicators (trend, MA, volume, pattern)
- Producing a structured opinion on trend/momentum/support-resistance
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from src.agent.agents.base_agent import BaseAgent
from src.agent.protocols import AgentContext, AgentOpinion
from src.agent.runner import RunLoopResult, try_parse_json
from src.agent.schemas import (
    TechnicalOpinionPayload,
    append_evidence_pool,
    validate_payload,
)

logger = logging.getLogger(__name__)


class TechnicalAgent(BaseAgent):
    agent_name = "technical"
    max_steps = 8
    tool_names = [
        "get_realtime_quote",
        "get_daily_history",
        "analyze_trend",
        "calculate_ma",
        "get_volume_analysis",
        "analyze_pattern",
        "get_chip_distribution",
        "get_analysis_context",
    ]

    def system_prompt(self, ctx: AgentContext) -> str:
        skills = ""
        if self.skill_instructions:
            skills = f"\n## Active Trading Skills\n\n{self.skill_instructions}\n"
        baseline = ""
        if self.technical_skill_policy:
            baseline = f"\n{self.technical_skill_policy}\n"

        return f"""\
You are a **Technical Analysis Agent** specialising in Chinese A-shares, \
Hong Kong stocks, and US equities.

Your task: perform a thorough technical analysis of the given stock and \
output a structured JSON opinion.

## Workflow (execute stages in order)
1. In the first tool round, fetch realtime quote and run trend analysis together.
2. Only fetch daily history / MA / volume / pattern / chip data when they are
   missing from trend analysis or materially needed for the conclusion.
3. After one or two tool rounds, produce the final JSON. Do not keep calling
   tools mechanically.

## Anti-Hallucination Rules
- Realtime quote and recent OHLCV data override your memory or prior market knowledge.
- If realtime quote is unavailable or stale, explicitly lower confidence and avoid strong_buy.
- Every bullish/bearish claim must cite a concrete price, volume, MA, turnover, chip, or pattern fact.
- Do not invent current price, support, resistance, stop-loss, or volume figures.
- If a tool says data is unavailable or non-retriable, do not retry the same
  call; state the data gap and lower confidence.

{baseline}
{skills}
## Output Format
Return **only** a JSON object (no markdown fences):
{{
  "signal": "strong_buy|buy|hold|sell|strong_sell",
  "confidence": 0.0-1.0,
  "reasoning": "2-3 sentence summary",
  "evidence": ["hard technical evidence, not generic claims"],
  "risks": ["technical invalidation risks"],
  "invalid_if": ["conditions that would invalidate this technical view"],
  "action_triggers": {{
    "entry": "price/volume condition for entry, or wait condition",
    "add": "condition for adding position",
    "reduce": "condition for reducing position"
  }},
  "key_levels": {{
    "support": <float>,
    "resistance": <float>,
    "stop_loss": <float>
  }},
  "trend_score": 0-100,
  "ma_alignment": "bullish|neutral|bearish",
  "volume_status": "heavy|normal|light",
  "pattern": "<detected pattern or none>"
}}
"""

    def build_user_message(self, ctx: AgentContext) -> str:
        parts = [f"Perform technical analysis on stock **{ctx.stock_code}**"]
        if ctx.stock_name:
            parts[0] += f" ({ctx.stock_name})"
        parts.append("Use your tools to fetch any missing data, then output the JSON opinion.")
        return "\n".join(parts)

    def post_process(self, ctx: AgentContext, raw_text: str) -> Optional[AgentOpinion]:
        """Parse the JSON opinion from the LLM response."""
        parsed = try_parse_json(raw_text)
        if parsed is None:
            logger.warning("[TechnicalAgent] failed to parse opinion JSON")
            return None
        parsed = validate_payload(TechnicalOpinionPayload, parsed)
        append_evidence_pool(ctx, agent_name=self.agent_name, payload=parsed)

        return AgentOpinion(
            agent_name=self.agent_name,
            signal=parsed.get("signal", "hold"),
            confidence=float(parsed.get("confidence", 0.5)),
            reasoning=parsed.get("reasoning", ""),
            key_levels={
                k: float(v) for k, v in parsed.get("key_levels", {}).items()
                if isinstance(v, (int, float))
            },
            raw_data=parsed,
        )

    def fallback_opinion(
        self,
        ctx: AgentContext,
        loop_result: RunLoopResult,
    ) -> Optional[AgentOpinion]:
        """Use collected tool data to avoid failing the full pipeline."""
        payload = _build_technical_fallback_payload(
            ctx,
            reason=loop_result.error or "technical agent did not produce final JSON",
        )
        parsed = validate_payload(TechnicalOpinionPayload, payload)
        append_evidence_pool(ctx, agent_name=self.agent_name, payload=parsed)
        return AgentOpinion(
            agent_name=self.agent_name,
            signal=parsed.get("signal", "hold"),
            confidence=float(parsed.get("confidence", 0.35)),
            reasoning=parsed.get("reasoning", ""),
            key_levels={
                k: float(v) for k, v in parsed.get("key_levels", {}).items()
                if isinstance(v, (int, float))
            },
            raw_data=parsed,
        )


def _build_technical_fallback_payload(ctx: AgentContext, *, reason: str) -> Dict[str, Any]:
    data = ctx.data if isinstance(ctx.data, dict) else {}
    quote = _as_dict(data.get("realtime_quote"))
    trend = _as_dict(data.get("trend_result"))
    history = _as_dict(data.get("daily_history"))
    chip = _as_dict(data.get("chip_distribution"))
    quality = _as_dict(data.get("data_quality_summary"))

    price = _first_number(
        quote.get("price"),
        quote.get("current_price"),
        trend.get("current_price"),
        _latest_history_value(history, "close"),
    )
    score = _fallback_trend_score(quote, trend)
    has_realtime = bool(quote) and not bool(_as_dict(quote.get("data_quality")).get("is_stale"))
    best_trust = _first_number(quality.get("best_trust_score"), 0.0) or 0.0
    signal = _fallback_signal(score, has_realtime)
    confidence = _fallback_confidence(score, best_trust, has_realtime, bool(trend or history))
    levels = _fallback_levels(price, trend, chip)
    evidence = _fallback_evidence(quote, trend, history, chip, quality)

    risks: List[str] = [f"Fallback used because {reason}; confidence is capped."]
    if not has_realtime:
        risks.append("Fresh realtime quote is unavailable or stale, so directional conviction is downgraded.")
    if not trend:
        risks.append("Trend indicator output is unavailable; technical signal relies on limited data.")

    invalid_if: List[str] = []
    support = levels.get("support")
    resistance = levels.get("resistance")
    if support is not None:
        invalid_if.append(f"Price breaks below support {support}.")
    if resistance is not None:
        invalid_if.append(f"Breakout above resistance {resistance} fails on weak volume.")
    if not invalid_if:
        invalid_if.append("Fresh realtime quote or OHLCV data contradicts the fallback signal.")

    return {
        "signal": signal,
        "confidence": confidence,
        "reasoning": (
            "The technical agent returned no final JSON, so this conservative fallback "
            "uses only collected quote, trend and history data. Realtime data has the "
            "highest weight; without fresh realtime data the signal is capped at hold."
        ),
        "evidence": evidence,
        "risks": risks,
        "invalid_if": invalid_if,
        "action_triggers": {
            "entry": _entry_trigger(signal, levels),
            "add": _add_trigger(levels),
            "reduce": _reduce_trigger(levels),
        },
        "key_levels": levels,
        "trend_score": score,
        "ma_alignment": str(trend.get("ma_alignment") or "neutral"),
        "volume_status": _fallback_volume_status(quote, trend),
        "pattern": str(trend.get("pattern") or "unknown"),
        "fallback": True,
        "fallback_reason": reason,
        "data_quality_summary": quality,
    }


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _first_number(*values: Any) -> Optional[float]:
    for value in values:
        if isinstance(value, (int, float)) and value > 0:
            return float(value)
        if isinstance(value, str):
            try:
                number = float(value)
            except ValueError:
                continue
            if number > 0:
                return number
    return None


def _number(value: Any) -> Optional[float]:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def _numbers_from(value: Any) -> List[float]:
    if isinstance(value, (list, tuple)):
        values = value
    else:
        values = [value]
    result: List[float] = []
    for item in values:
        number = _first_number(item)
        if number is not None:
            result.append(number)
    return result


def _latest_history_value(history: Dict[str, Any], key: str) -> Optional[float]:
    records = history.get("data")
    if not isinstance(records, list) or not records:
        record = history.get("latest_record")
    else:
        record = records[-1]
    if not isinstance(record, dict):
        return None
    return _first_number(record.get(key))


def _fallback_trend_score(quote: Dict[str, Any], trend: Dict[str, Any]) -> float:
    explicit = _first_number(trend.get("signal_score"), trend.get("trend_score"))
    if explicit is not None:
        return round(max(0.0, min(100.0, explicit)), 2)

    score = 50.0
    change_pct = _number(quote.get("change_pct"))
    if change_pct is not None:
        if change_pct >= 5:
            score += 16
        elif change_pct >= 2:
            score += 9
        elif change_pct <= -5:
            score -= 16
        elif change_pct <= -2:
            score -= 9

    volume_ratio = _first_number(quote.get("volume_ratio"), trend.get("volume_ratio_5d"))
    if volume_ratio is not None:
        if volume_ratio >= 1.5 and change_pct is not None and change_pct > 0:
            score += 6
        elif volume_ratio >= 1.5 and change_pct is not None and change_pct < 0:
            score -= 6
        elif volume_ratio < 0.6:
            score -= 3

    text = " ".join(str(trend.get(k) or "").lower() for k in ("ma_alignment", "trend_status", "buy_signal"))
    if any(word in text for word in ("bull", "buy", "up", "long")):
        score += 8
    if any(word in text for word in ("bear", "sell", "down", "short")):
        score -= 8
    return round(max(0.0, min(100.0, score)), 2)


def _fallback_signal(score: float, has_realtime: bool) -> str:
    if score >= 70 and has_realtime:
        return "buy"
    if score <= 30:
        return "sell"
    return "hold"


def _fallback_confidence(
    score: float,
    best_trust: float,
    has_realtime: bool,
    has_technical_data: bool,
) -> float:
    conviction = abs(score - 50.0) / 50.0
    trust = max(0.0, min(1.0, best_trust))
    confidence = 0.34 + 0.22 * conviction + 0.28 * trust
    if has_technical_data:
        confidence += 0.05
    if not has_realtime:
        confidence = min(confidence, 0.52)
    return round(max(0.25, min(0.68, confidence)), 2)


def _fallback_levels(
    price: Optional[float],
    trend: Dict[str, Any],
    chip: Dict[str, Any],
) -> Dict[str, float]:
    support_candidates = (
        _numbers_from(trend.get("support_levels"))
        + _numbers_from(trend.get("support_ma5"))
        + _numbers_from(trend.get("support_ma10"))
        + _numbers_from(trend.get("ma20"))
        + _numbers_from(chip.get("cost_90_low"))
        + _numbers_from(chip.get("avg_cost"))
    )
    resistance_candidates = (
        _numbers_from(trend.get("resistance_levels"))
        + _numbers_from(chip.get("cost_90_high"))
    )
    support = _nearest_below(price, support_candidates)
    resistance = _nearest_above(price, resistance_candidates)

    levels: Dict[str, float] = {}
    if support is not None:
        levels["support"] = round(support, 2)
        levels["stop_loss"] = round(support * 0.98, 2)
    if resistance is not None:
        levels["resistance"] = round(resistance, 2)
    return levels


def _nearest_below(price: Optional[float], values: List[float]) -> Optional[float]:
    if not values:
        return None
    if price is None:
        return values[0]
    below = [v for v in values if v <= price * 1.02]
    return max(below) if below else min(values, key=lambda v: abs(v - price))


def _nearest_above(price: Optional[float], values: List[float]) -> Optional[float]:
    if not values:
        return None
    if price is None:
        return values[0]
    above = [v for v in values if v >= price * 0.98]
    return min(above) if above else min(values, key=lambda v: abs(v - price))


def _fallback_evidence(
    quote: Dict[str, Any],
    trend: Dict[str, Any],
    history: Dict[str, Any],
    chip: Dict[str, Any],
    quality: Dict[str, Any],
) -> List[str]:
    evidence: List[str] = []
    price = _first_number(quote.get("price"), quote.get("current_price"))
    if price is not None:
        evidence.append(
            "Realtime quote: "
            f"price={price}, change_pct={quote.get('change_pct')}, "
            f"volume_ratio={quote.get('volume_ratio')}, source={quote.get('source')}."
        )
    if trend:
        evidence.append(
            "Trend result: "
            f"signal_score={trend.get('signal_score')}, ma_alignment={trend.get('ma_alignment')}, "
            f"macd={trend.get('macd_status')}, rsi={trend.get('rsi_status')}."
        )
    if history:
        evidence.append(
            "History data: "
            f"records={history.get('actual_records') or history.get('data_points')}, "
            f"source={history.get('source')}."
        )
    if chip:
        evidence.append(
            "Chip distribution: "
            f"profit_ratio={chip.get('profit_ratio')}, avg_cost={chip.get('avg_cost')}."
        )
    if quality:
        evidence.append(
            "Data quality: "
            f"best_trust={quality.get('best_trust_score')}, "
            f"has_realtime={quality.get('has_realtime')}."
        )
    return evidence or ["No reliable technical data was collected; fallback defaults to a low-confidence hold."]


def _fallback_volume_status(quote: Dict[str, Any], trend: Dict[str, Any]) -> str:
    value = str(trend.get("volume_status") or "").strip()
    if value:
        return value
    volume_ratio = _first_number(quote.get("volume_ratio"), trend.get("volume_ratio_5d"))
    if volume_ratio is None:
        return "unknown"
    if volume_ratio >= 1.5:
        return "heavy"
    if volume_ratio <= 0.7:
        return "light"
    return "normal"


def _entry_trigger(signal: str, levels: Dict[str, float]) -> str:
    if signal == "buy":
        return "Consider entry only if price holds above support with expanding volume."
    support = levels.get("support")
    if support is not None:
        return f"Wait for price to stabilize above support {support}."
    return "Wait for fresh realtime quote and trend confirmation."


def _add_trigger(levels: Dict[str, float]) -> str:
    resistance = levels.get("resistance")
    if resistance is not None:
        return f"Add only after a confirmed breakout above {resistance} with volume confirmation."
    return "Add only after a new high is confirmed by fresh OHLCV data."


def _reduce_trigger(levels: Dict[str, float]) -> str:
    stop_loss = levels.get("stop_loss")
    if stop_loss is not None:
        return f"Reduce if price breaks below stop-loss reference {stop_loss}."
    return "Reduce if realtime price weakens while volume expands."

