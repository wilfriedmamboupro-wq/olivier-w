"""State schema for the RFP LangGraph. Every node receives the full state
and returns a partial dict to merge in -- list fields use `operator.add` so
nodes append (trace, messages) instead of each node having to re-send the
whole history.
"""
from __future__ import annotations

import operator
from typing import Annotated, Any, Optional, TypedDict


class LaneInput(TypedDict):
    origin: str
    destination: str
    tons: float
    max_transit_days: float
    shipper_note: str


class RequirementResult(TypedDict):
    code: str
    label: str
    fulfilled: bool
    unsupported_legs: list[str]


class Lane(TypedDict, total=False):
    lane_id: str
    origin: str
    destination: str
    tons: float
    max_transit_days: float
    shipper_note: str
    requirements_requested: list[str]
    route_airports: list[str]
    route_transit_days: float
    requirement_results: list[RequirementResult]
    price_per_ton: Optional[float]
    status: str
    needs_human_review: bool
    review_reasons: list[str]


class Message(TypedDict):
    thread: str  # "PRICING" | "CUSTOMER"
    direction: str  # "outbound" | "inbound" | "draft" | "cancelled"
    subject: str
    body: str


class TraceEvent(TypedDict):
    step: str
    status: str  # "running" | "done" | "needs_human" | "error"
    summary: str
    actor: str  # "claude" | "human" | "system"


def _keep_last(_old, new):
    return new


class RfpState(TypedDict):
    rfp_id: str
    customer_email: str
    customer_name: str
    lanes: Annotated[list[Lane], _keep_last]
    messages: Annotated[list[Message], operator.add]
    trace: Annotated[list[TraceEvent], operator.add]
    status: Annotated[str, _keep_last]
    pending_draft: Annotated[Optional[dict[str, Any]], _keep_last]
