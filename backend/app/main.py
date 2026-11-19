"""FastAPI server exposing the RFP LangGraph: create a run, read its current
state (including whatever human-approval gate it's paused at, if any), and
resume it with a decision. The graph's own SqliteSaver checkpointer is the
source of truth for state -- this layer is just HTTP plumbing plus a small
index table (app/db.py) so the dashboard can list every RFP ever created.
"""
from __future__ import annotations

import os
import threading
import uuid
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from langgraph.types import Command
from pydantic import BaseModel, Field

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from . import db  # noqa: E402
from .data_loader import load_default_transit_table  # noqa: E402
from .graph import get_graph  # noqa: E402

_TRANSIT_LEGS = load_default_transit_table()
_AIRPORTS = sorted({leg.origin for leg in _TRANSIT_LEGS} | {leg.destination for leg in _TRANSIT_LEGS})
_MAX_LANES_PER_RFP = 20

# The checkpointer holds one sqlite3 connection shared across requests, and
# FastAPI runs sync route handlers in a threadpool -- so two requests can
# reach it from different threads at once. sqlite3 connections aren't safe
# for concurrent use even with check_same_thread=False (that flag only
# disables Python's same-thread *assertion*, it doesn't add real locking).
# A single process-wide lock serializes all graph access instead.
_graph_lock = threading.Lock()

_API_KEY = os.environ.get("API_KEY")


def require_api_key(x_api_key: Optional[str] = Header(default=None)) -> None:
    if _API_KEY and x_api_key != _API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


app = FastAPI(title="RFP Automation v2 (LangGraph)")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=os.environ.get("CORS_ORIGIN_REGEX", r"http://localhost:\d+"),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-API-Key"],
)

_protected = [Depends(require_api_key)]


class LaneRequest(BaseModel):
    origin: str
    destination: str
    tons: float
    max_transit_days: float
    shipper_note: str = ""


class CreateRfpRequest(BaseModel):
    customer_name: str
    customer_email: str
    lanes: list[LaneRequest] = Field(min_length=1, max_length=_MAX_LANES_PER_RFP)


class ResumeRequest(BaseModel):
    payload: dict[str, Any]


def _config(rfp_id: str) -> dict:
    return {"configurable": {"thread_id": rfp_id}}


def _get_state(config: dict):
    with _graph_lock:
        return get_graph().get_state(config)


def _invoke(payload, config: dict) -> None:
    with _graph_lock:
        get_graph().invoke(payload, config=config)


def _pending_interrupt(snapshot) -> Optional[dict]:
    for task in snapshot.tasks:
        if task.interrupts:
            return task.interrupts[0].value
    return None


def _serialize(rfp_id: str) -> dict:
    snapshot = _get_state(_config(rfp_id))
    if not snapshot.values:
        raise HTTPException(status_code=404, detail="RFP not found")
    values = snapshot.values
    return {
        "rfp_id": rfp_id,
        "customer_name": values.get("customer_name"),
        "customer_email": values.get("customer_email"),
        "lanes": values.get("lanes", []),
        "messages": values.get("messages", []),
        "trace": values.get("trace", []),
        "status": values.get("status"),
        "is_paused": bool(snapshot.next),
        "pending_interrupt": _pending_interrupt(snapshot),
    }


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/airports", dependencies=_protected)
def list_airports() -> list[str]:
    return _AIRPORTS


@app.post("/api/rfps", dependencies=_protected)
def create_rfp(req: CreateRfpRequest) -> dict:
    rfp_id = str(uuid.uuid4())
    initial_state = {
        "rfp_id": rfp_id,
        "customer_email": req.customer_email,
        "customer_name": req.customer_name,
        "lanes": [lane.model_dump() for lane in req.lanes],
        "messages": [],
        "trace": [],
        "status": "NEW",
        "pending_draft": None,
    }
    _invoke(initial_state, _config(rfp_id))
    db.insert_rfp_index(rfp_id, req.customer_name, req.customer_email, len(req.lanes))
    return _serialize(rfp_id)


@app.get("/api/rfps", dependencies=_protected)
def list_rfps() -> list[dict]:
    out = []
    for row in db.list_rfp_index():
        try:
            out.append(_serialize(row["rfp_id"]))
        except HTTPException:
            continue
    return out


@app.get("/api/rfps/{rfp_id}", dependencies=_protected)
def get_rfp(rfp_id: str) -> dict:
    return _serialize(rfp_id)


@app.post("/api/rfps/{rfp_id}/resume", dependencies=_protected)
def resume_rfp(rfp_id: str, req: ResumeRequest) -> dict:
    config = _config(rfp_id)
    snapshot = _get_state(config)
    if not snapshot.values:
        raise HTTPException(status_code=404, detail="RFP not found")
    if not snapshot.next:
        raise HTTPException(status_code=409, detail="This RFP is not waiting on a decision")
    _invoke(Command(resume=req.payload), config)
    return _serialize(rfp_id)


@app.get("/api/proposals", dependencies=_protected)
def get_proposals() -> list[dict]:
    return db.list_proposals()
