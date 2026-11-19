# Lanebook — RFP Automation

Air-freight RFP automation on a local-first stack: **LangGraph** orchestrates
the pipeline as an explicit state machine, **FastAPI** exposes it over HTTP,
and a **React + TypeScript** frontend drives it. SQLite handles persistence,
and the LangGraph checkpointer tracks run state.

Routing a lane through the Transit Table, scoring which special requirements
a route can fulfill, and computing the baseline price per ton are all plain
deterministic Python (`app/transit_graph.py`, `app/pricing_heuristic.py`) —
**never done by the LLM**. Claude's job is narrow: extracting requirements
from free text and drafting the prose of each email, always around numbers
it's handed, never numbers it invents.

## Architecture

```
backend/app/
  models.py, transit_graph.py, requirements_catalog.py, pricing_heuristic.py
      deterministic routing/pricing/requirement logic
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

Two processes, two terminals: the backend first, then the frontend.

### 1. Backend — http://localhost:8000

```
cd backend
python -m venv .venv
.venv/Scripts/activate        # Windows (Git Bash/PowerShell); use `source .venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
cp .env.example .env          # fill in ANTHROPIC_API_KEY at minimum
python -m uvicorn app.main:app --port 8000
```

Check it came up: `curl http://localhost:8000/api/health` should return `{"ok":true}`.
Interactive API docs (Swagger UI) are at `http://localhost:8000/docs` — if
`API_KEY` is set, click **Authorize** there and paste it to try routes
directly from the browser; ReDoc is at `/redoc` and the raw schema at
`/openapi.json`.
Without `SMTP_USERNAME`/`SMTP_PASSWORD` set in `.env`, quote emails are logged
to the console instead of sent — the pipeline still runs end to end.

If `.env` sets `API_KEY`, every route except `/api/health` requires that
exact value in an `X-API-Key` header (401 otherwise) — set the same value in
`frontend/.env.local` as `VITE_API_KEY` so the UI keeps working. Leave both
unset to run with no auth (fine for a throwaway local demo only).

`POST /api/rfps` is capped at 10 requests/minute and `POST
/api/rfps/{id}/resume` at 20/minute per API key (or per IP if no key is
set) — each creates or resumes an LLM-driven run, so this bounds runaway
cost/abuse. Every response also carries a few baseline security headers
(`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
`Cross-Origin-Resource-Policy`).

### 2. Frontend — http://localhost:5173

```
cd frontend
npm install
cp .env.example .env.local    # VITE_API_BASE_URL, defaults to http://localhost:8000
npm run dev
```

Open the URL Vite prints (`5173`, or the next free port if one is already
taken). Click **+ New RFP** and walk a lane through the pipeline: approve the
pricing request, approve the quote, then record a simulated or real customer
reply.

### Stopping

`Ctrl+C` in each terminal. On Windows, if a port is stuck in use from a
previous run: `netstat -ano | grep :8000` (or `:5173`) to find the PID, then
`taskkill //PID <pid> //F`.

## Testing

```
cd backend
python -m pytest
```
