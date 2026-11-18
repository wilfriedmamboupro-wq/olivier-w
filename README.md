# Lanebook v2 — RFP Automation on LangGraph

Second implementation of the same RFP automation brief as the v1 (AWS Bedrock
+ Lambda + API Gateway) build, this time on a local-first stack: **LangGraph**
orchestrates the pipeline as an explicit state machine, **FastAPI** exposes it
over HTTP, and a new **React + TypeScript** frontend drives it. No AWS
dependency anywhere — SQLite replaces RDS, and the LangGraph checkpointer
replaces DynamoDB for run state.

The business logic is unchanged from v1 and is **never done by the LLM**:
routing a lane through the Transit Table, scoring which special requirements
a route can fulfill, and computing the baseline price per ton are all plain
deterministic Python (`app/transit_graph.py`, `app/pricing_heuristic.py`).
Claude's job is narrow — extracting requirements from free text and drafting
the prose of each email — and it always drafts around numbers it's handed,
never numbers it invents.

## Architecture

```
backend/app/
  models.py, transit_graph.py, requirements_catalog.py, pricing_heuristic.py
      deterministic routing/pricing/requirement logic (ported from v1)
  data_loader.py, data/transit_table.csv
      the carrier's Transit Table
  state.py        the RfpState TypedDict the graph operates on
  llm.py          thin ChatAnthropic wrapper (langchain-anthropic)
  email_sender.py SMTP send with mock fallback + TEST_EMAIL_OVERRIDE
  db.py           SQLite: accepted-proposal log + an RFP index for the dashboard
  nodes.py        one function per graph node
  graph.py        StateGraph wiring + SqliteSaver checkpointer
  main.py         FastAPI: create / get / resume / list endpoints

frontend/src/
  pages/      Dashboard, NewRfp, RfpDetail
  components/ LaneTable, ApprovalCard, OrchestrationTrace, MessageThread, ...
```

### The graph

```
ingest_and_route → draft_pricing_request → await_pricing_approval (⏸ human)
  → simulate_pricing_reply → parse_pricing_reply → draft_quote
  → await_quote_approval (⏸ human) → await_customer_response (⏸ human/demo)
  → finalize_accept | finalize_reject
```

Each `⏸` is a real `interrupt()` call: the graph suspends, FastAPI returns the
current state plus the pending question, and `POST /api/rfps/{id}/resume`
replays `Command(resume=...)` into the *same* LangGraph thread to continue.
A node that calls `interrupt()` re-runs from its own top on every resume, so
the design splits "do the LLM work" (draft_*) from "wait for a human"
(await_*) into separate nodes — the draft only ever runs once per step.

The customer-response step supports two modes: **simulate** (Claude writes a
plausible accept/reject reply for demo purposes — no real customer exists in
this environment) or **real**, where you paste in an actual reply and Claude
classifies it.

## Running locally

### Backend

```
cd backend
python -m venv .venv && .venv/Scripts/activate   # or source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in ANTHROPIC_API_KEY at minimum
python -m uvicorn app.main:app --port 8000
```

Without `SMTP_USERNAME`/`SMTP_PASSWORD` set, quote emails are logged to the
console instead of sent — the pipeline still runs end to end.

### Frontend

```
cd frontend
npm install
cp .env.example .env.local   # VITE_API_BASE_URL, defaults to http://localhost:8000
npm run dev
```

Open the printed localhost URL, click **+ New RFP**, and walk a lane through
the pipeline — approve the pricing request, approve the quote, then record a
simulated or real customer reply.

## Testing

```
cd backend
python -m pytest
```
