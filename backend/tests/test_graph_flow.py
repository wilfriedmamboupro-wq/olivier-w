"""End-to-end test of the RFP graph using the deterministic fallback paths
(every LLM call in app/nodes.py is wrapped in try/except and falls back to a
keyword/regex/template method on failure) -- so this suite needs no real
Anthropic API key and makes no network calls, while still exercising the
full ingest -> route -> price -> quote -> accept/reject flow and both
interrupt/resume gates.
"""
from __future__ import annotations

import sys
import uuid

import pytest
from langgraph.types import Command

_APP_MODULES = ["app.graph", "app.nodes", "app.db", "app.llm"]


@pytest.fixture
def graph(tmp_path, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-invalid-for-tests")
    monkeypatch.setenv("CHECKPOINT_DB_PATH", str(tmp_path / "checkpoints.db"))
    monkeypatch.setenv("PROPOSALS_DB_PATH", str(tmp_path / "proposals.db"))

    # app.db and app.graph read their DB paths from the environment once at
    # import time, so each test needs a fresh import bound to its own tmp_path
    # rather than the module cached (and pinned to a different path) by a
    # previous test in the same pytest process.
    for name in _APP_MODULES:
        sys.modules.pop(name, None)

    from app.graph import build_graph

    return build_graph()


def _base_state(rfp_id: str, lanes: list[dict]) -> dict:
    return {
        "rfp_id": rfp_id,
        "customer_email": "customer@example.com",
        "customer_name": "Acme Shipping",
        "lanes": lanes,
        "messages": [],
        "trace": [],
        "status": "NEW",
        "pending_draft": None,
    }


def test_happy_path_accept_logs_proposal(graph):
    rfp_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": rfp_id}}
    lanes = [
        {
            "lane_id": "L001",
            "origin": "JFK",
            "destination": "LHR",
            "tons": 5.0,
            "max_transit_days": 3.0,
            "shipper_note": "Standard general cargo, nothing special.",
        }
    ]

    result = graph.invoke(_base_state(rfp_id, lanes), config=config)
    assert graph.get_state(config).next == ("await_pricing_approval",)
    assert result["lanes"][0]["status"] == "ROUTED"

    result = graph.invoke(Command(resume={"approve": True}), config=config)
    assert graph.get_state(config).next == ("await_quote_approval",)
    assert result["lanes"][0]["price_per_ton"] is not None
    assert result["lanes"][0]["status"] == "PRICED"

    result = graph.invoke(Command(resume={"approve": True}), config=config)
    assert graph.get_state(config).next == ("await_customer_response",)
    assert result["lanes"][0]["status"] == "QUOTE_SENT"

    result = graph.invoke(Command(resume={"mode": "simulate", "decision": "accepted"}), config=config)
    assert graph.get_state(config).next == ()
    assert result["status"] == "ACCEPTED"

    from app.db import list_proposals

    proposals = list_proposals()
    assert len(proposals) == 1
    assert proposals[0]["rfp_id"] == rfp_id
    assert proposals[0]["lane_id"] == "L001"


def test_customer_rejection_skips_proposal_log(graph):
    rfp_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": rfp_id}}
    lanes = [
        {
            "lane_id": "L001",
            "origin": "JFK",
            "destination": "LHR",
            "tons": 5.0,
            "max_transit_days": 3.0,
            "shipper_note": "Standard general cargo.",
        }
    ]

    graph.invoke(_base_state(rfp_id, lanes), config=config)
    graph.invoke(Command(resume={"approve": True}), config=config)
    graph.invoke(Command(resume={"approve": True}), config=config)
    result = graph.invoke(Command(resume={"mode": "simulate", "decision": "rejected"}), config=config)

    assert result["status"] == "REJECTED"
    assert graph.get_state(config).next == ()

    from app.db import list_proposals

    assert list_proposals() == []


def test_unroutable_lane_flagged_for_human_review(graph):
    rfp_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": rfp_id}}
    lanes = [
        {
            "lane_id": "L001",
            "origin": "ZZZ",
            "destination": "YYY",
            "tons": 1.0,
            "max_transit_days": 1.0,
            "shipper_note": "Standard general cargo.",
        }
    ]

    result = graph.invoke(_base_state(rfp_id, lanes), config=config)
    lane = result["lanes"][0]
    assert lane["needs_human_review"] is True
    assert lane["status"] == "NEEDS_HUMAN_REVIEW"
    assert lane["review_reasons"]


def test_pricing_cancel_ends_run_without_sending(graph):
    rfp_id = str(uuid.uuid4())
    config = {"configurable": {"thread_id": rfp_id}}
    lanes = [
        {
            "lane_id": "L001",
            "origin": "JFK",
            "destination": "LHR",
            "tons": 5.0,
            "max_transit_days": 3.0,
            "shipper_note": "Standard general cargo.",
        }
    ]

    graph.invoke(_base_state(rfp_id, lanes), config=config)
    result = graph.invoke(Command(resume={"approve": False}), config=config)

    assert graph.get_state(config).next == ()
    assert result["messages"] == []
    assert result["lanes"][0]["status"] == "ROUTED"
