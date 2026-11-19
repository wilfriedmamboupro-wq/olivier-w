"""FastAPI server exposing the RFP LangGraph: create a run, read its current
state, and resume it with a decision.
"""
from __future__ import annotations

import os
import threading
import uuid
from pathlib import Path
from typing import Any, Literal, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader
from langgraph.types import Command
from pydantic import BaseModel, EmailStr, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from . import db  # noqa: E402
from .data_loader import load_default_transit_table  # noqa: E402
from .graph import get_graph  # noqa: E402

_TRANSIT_LEGS = load_default_transit_table()
_AIRPORTS = sorted({leg.origin for leg in _TRANSIT_LEGS} | {leg.destination for leg in _TRANSIT_LEGS})
_MAX_LANES_PER_RFP = 20

# Serializes all graph access: the checkpointer's sqlite3 connection is
# shared across requests and isn't safe for concurrent use.
_graph_lock = threading.Lock()

_API_KEY = os.environ.get("API_KEY")

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False, description="Required when the server has API_KEY set.")


def require_api_key(x_api_key: Optional[str] = Depends(_api_key_header)) -> None:
    if _API_KEY and x_api_key != _API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


def _rate_limit_key(request: Request) -> str:
    """Rate-limit per API key when one is configured (so clients behind a
    shared IP are tracked separately); fall back to the caller's IP."""
    api_key = request.headers.get("x-api-key")
    if api_key:
        return api_key
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=_rate_limit_key)

app = FastAPI(
    title="Lanebook — RFP Automation API",
    version="2.0.0",
    description=(
        "Routes shipper RFP lanes against the carrier's Transit Table, drafts pricing and "
        "customer-quote emails via Claude, and pauses for human approval at each email send "
        "and at the customer's response. Routing and pricing are always deterministic Python -- "
        "the LLM only drafts prose around numbers it's handed, never sets one itself.\n\n"
        "If `API_KEY` is set on the server, every route below except `/api/health` requires it "
        "in an `X-API-Key` header -- click **Authorize** and paste the key to try these from here."
    ),
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=os.environ.get("CORS_ORIGIN_REGEX", r"http://localhost:\d+"),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-API-Key"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cross-Origin-Resource-Policy"] = "same-site"
    return response


_protected = [Depends(require_api_key)]


class LaneRequest(BaseModel):
    origin: str = Field(description="Origin airport code, e.g. JFK", examples=["JFK"])
    destination: str = Field(description="Destination airport code, e.g. LHR", examples=["LHR"])
    tons: float = Field(examples=[5.0])
    max_transit_days: float = Field(examples=[3.0])
    shipper_note: str = Field(default="", description="Free text the shipper wrote; Claude extracts special requirements from it")


class CreateRfpRequest(BaseModel):
    customer_name: str
    customer_email: EmailStr
    lanes: list[LaneRequest] = Field(min_length=1, max_length=_MAX_LANES_PER_RFP)


class ResumeRequest(BaseModel):
    payload: dict[str, Any] = Field(
        description=(
            "Shape depends on the pending_interrupt.action being resumed: "
            '{"approve": true, "subject"?: str, "body"?: str} for approve_pricing_send/approve_quote_send, or '
            '{"mode": "simulate", "decision": "accepted"|"rejected"} / {"mode": "real", "body": str} for customer_response_needed.'
        )
    )


class RequirementResultResponse(BaseModel):
    code: str
    label: str
    fulfilled: bool
    unsupported_legs: list[str]


class LaneResponse(BaseModel):
    lane_id: str
    origin: str
    destination: str
    tons: float
    max_transit_days: float
    shipper_note: str
    requirements_requested: list[str]
    route_airports: list[str]
    route_transit_days: float
    requirement_results: list[RequirementResultResponse]
    price_per_ton: Optional[float]
    status: str
    needs_human_review: bool
    review_reasons: list[str]


class MessageResponse(BaseModel):
    thread: Literal["PRICING", "CUSTOMER"]
    direction: Literal["outbound", "inbound"]
    subject: str
    body: str


class TraceEventResponse(BaseModel):
    step: str
    status: Literal["running", "done", "needs_human", "error"]
    summary: str
    actor: Literal["claude", "human", "system"]


class PendingInterruptResponse(BaseModel):
    action: Literal["approve_pricing_send", "approve_quote_send", "customer_response_needed"]
    subject: Optional[str] = None
    body: Optional[str] = None


class RfpResponse(BaseModel):
    rfp_id: str
    customer_name: str
    customer_email: str
    lanes: list[LaneResponse]
    messages: list[MessageResponse]
    trace: list[TraceEventResponse]
    status: str
    is_paused: bool
    pending_interrupt: Optional[PendingInterruptResponse]


class ProposalResponse(BaseModel):
    id: int
    rfp_id: str
    lane_id: str
    origin: str
    destination: str
    tons: float
    route_airports: str = Field(description="JSON-encoded list of airport codes")
    transit_days: float
    requirements_requested: str = Field(description="JSON-encoded list of requirement codes")
    requirements_fulfilled: str = Field(description="JSON-encoded {code: fulfilled} map")
    price_per_ton: float
    total_price: float
    customer_email: str
    accepted_at: str


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


@app.get("/api/health", tags=["system"], summary="Health check")
def health() -> dict:
    return {"ok": True}


@app.get("/api/airports", tags=["system"], dependencies=_protected, summary="List airports the Transit Table serves")
def list_airports() -> list[str]:
    return _AIRPORTS


@app.post(
    "/api/rfps",
    tags=["rfps"],
    dependencies=_protected,
    summary="Create an RFP and run it to the first human approval",
    description="Routes every lane, drafts the pricing-team email, and pauses there. Capped at 10 requests/minute.",
)
@limiter.limit("10/minute")
def create_rfp(request: Request, req: CreateRfpRequest) -> RfpResponse:
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


@app.get("/api/rfps", tags=["rfps"], dependencies=_protected, summary="List every RFP ever created")
def list_rfps() -> list[RfpResponse]:
    out = []
    for row in db.list_rfp_index():
        try:
            out.append(_serialize(row["rfp_id"]))
        except HTTPException:
            continue
    return out


@app.get("/api/rfps/{rfp_id}", tags=["rfps"], dependencies=_protected, summary="Get one RFP's current state")
def get_rfp(rfp_id: str) -> RfpResponse:
    return _serialize(rfp_id)


@app.post(
    "/api/rfps/{rfp_id}/resume",
    tags=["rfps"],
    dependencies=_protected,
    summary="Resume a paused RFP with a human decision",
    description="Replays `payload` into the paused LangGraph thread and runs to the next pause or the end. Capped at 20 requests/minute.",
    responses={404: {"description": "No RFP with this id"}, 409: {"description": "This RFP isn't waiting on a decision"}},
)
@limiter.limit("20/minute")
def resume_rfp(request: Request, rfp_id: str, req: ResumeRequest) -> RfpResponse:
    config = _config(rfp_id)
    snapshot = _get_state(config)
    if not snapshot.values:
        raise HTTPException(status_code=404, detail="RFP not found")
    if not snapshot.next:
        raise HTTPException(status_code=409, detail="This RFP is not waiting on a decision")
    _invoke(Command(resume=req.payload), config)
    return _serialize(rfp_id)


@app.get("/api/proposals", tags=["proposals"], dependencies=_protected, summary="List every accepted, logged proposal")
def get_proposals() -> list[ProposalResponse]:
    return db.list_proposals()
