"""Thin wrapper around langchain-anthropic for the narrow, single-shot LLM
calls used inside graph nodes (drafting prose, extracting structured data).
Sampling parameters (temperature/top_p) are deliberately never set -- recent
Claude models (Opus 4.7+) reject them outright, and adaptive thinking +
prompting alone steer quality well enough.
"""
from __future__ import annotations

import json
import os
import re

from langchain_anthropic import ChatAnthropic

_MODEL_ID = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5")

# $ per million tokens (input, output) -- platform.claude.com/docs/en/pricing.
_PRICING_PER_MTOK = {
    "claude-opus-4-8": (5.00, 25.00),
    "claude-sonnet-5": (3.00, 15.00),
    "claude-haiku-4-5": (1.00, 5.00),
}

_llm = None
total_cost_usd = 0.0
call_count = 0


def _get_llm() -> ChatAnthropic:
    global _llm
    if _llm is None:
        _llm = ChatAnthropic(model=_MODEL_ID, max_tokens=1536)
    return _llm


def _track_cost(usage: dict | None) -> None:
    global total_cost_usd, call_count
    if not usage:
        return
    in_price, out_price = _PRICING_PER_MTOK.get(_MODEL_ID, _PRICING_PER_MTOK["claude-haiku-4-5"])
    cost = (usage.get("input_tokens", 0) / 1_000_000) * in_price + (usage.get("output_tokens", 0) / 1_000_000) * out_price
    total_cost_usd += cost
    call_count += 1
    print(f"[llm] call #{call_count}: {usage.get('input_tokens')} in / {usage.get('output_tokens')} out -> ${cost:.5f} (total ${total_cost_usd:.5f})")


def invoke_text(system: str, user_prompt: str) -> str:
    response = _get_llm().invoke([("system", system), ("human", user_prompt)])
    _track_cost(getattr(response, "usage_metadata", None))
    return response.content


_JSON_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.S)


def invoke_json(system: str, user_prompt: str) -> dict:
    text = invoke_text(system, user_prompt)
    fenced = _JSON_FENCE.search(text)
    candidate = fenced.group(1) if fenced else text
    try:
        return json.loads(candidate)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Model did not return valid JSON: {text!r}") from exc
