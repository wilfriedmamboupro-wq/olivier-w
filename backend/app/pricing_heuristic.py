"""Deterministic baseline price used to ground the mock Pricing Team email.

We never let the LLM invent the dollar figures themselves -- it only phrases
the email around numbers computed here -- so the numbers a human reviewer
sees are always reproducible and auditable, never a hallucination.
This is a simple, transparent placeholder for whatever rate card / costing
model the real Pricing team would apply.
"""
from __future__ import annotations

BASE_RATE_PER_TON = 1200.0
RATE_PER_TRANSIT_DAY = 80.0
SURCHARGE_PER_SPECIAL_REQUIREMENT = 150.0


def suggested_price_per_ton(transit_days: float, requirement_count: int) -> float:
    price = BASE_RATE_PER_TON + RATE_PER_TRANSIT_DAY * transit_days + SURCHARGE_PER_SPECIAL_REQUIREMENT * requirement_count
    return round(price, 2)
