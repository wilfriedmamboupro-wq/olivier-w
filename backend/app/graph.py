"""Assembles the RFP StateGraph: a linear spine with two human-approval
gates (pricing send, quote send) and one branch point (accept vs reject).
"""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path

from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, StateGraph

from . import nodes
from .state import RfpState

_CHECKPOINT_PATH = Path(os.environ.get("CHECKPOINT_DB_PATH", Path(__file__).resolve().parent.parent / "checkpoints.db"))

_compiled = None


def build_graph():
    graph = StateGraph(RfpState)

    graph.add_node("ingest_and_route", nodes.ingest_and_route)
    graph.add_node("draft_pricing_request", nodes.draft_pricing_request)
    graph.add_node("await_pricing_approval", nodes.await_pricing_approval)
    graph.add_node("simulate_pricing_reply", nodes.simulate_pricing_reply)
    graph.add_node("parse_pricing_reply", nodes.parse_pricing_reply)
    graph.add_node("draft_quote", nodes.draft_quote)
    graph.add_node("await_quote_approval", nodes.await_quote_approval)
    graph.add_node("await_customer_response", nodes.await_customer_response)
    graph.add_node("finalize_accept", nodes.finalize_accept)
    graph.add_node("finalize_reject", nodes.finalize_reject)

    graph.set_entry_point("ingest_and_route")
    graph.add_edge("ingest_and_route", "draft_pricing_request")
    graph.add_edge("draft_pricing_request", "await_pricing_approval")
    graph.add_conditional_edges(
        "await_pricing_approval",
        nodes.route_after_pricing_approval,
        {"simulate_pricing_reply": "simulate_pricing_reply", "__end__": END},
    )
    graph.add_edge("simulate_pricing_reply", "parse_pricing_reply")
    graph.add_edge("parse_pricing_reply", "draft_quote")
    graph.add_edge("draft_quote", "await_quote_approval")
    graph.add_conditional_edges(
        "await_quote_approval",
        nodes.route_after_quote_approval,
        {"await_customer_response": "await_customer_response", "__end__": END},
    )
    graph.add_conditional_edges(
        "await_customer_response",
        nodes.route_after_response,
        {"finalize_accept": "finalize_accept", "finalize_reject": "finalize_reject"},
    )
    graph.add_edge("finalize_accept", END)
    graph.add_edge("finalize_reject", END)

    conn = sqlite3.connect(str(_CHECKPOINT_PATH), check_same_thread=False)
    checkpointer = SqliteSaver(conn)
    return graph.compile(checkpointer=checkpointer)


def get_graph():
    global _compiled
    if _compiled is None:
        _compiled = build_graph()
    return _compiled
