# Lanebook v2 — Technical Architecture

This document explains what the project does, why each major technical
choice was made, and what else could have been used instead. It's a
reference for understanding and maintaining the codebase, not user-facing
documentation (see `README.md` for that).

## 1. What the project does

An air-freight carrier's RFP Response Team receives shipper requests
("lanes": origin, destination, tons, max transit days, plus a free-text
note). For each lane, the system:

1. Extracts any special requirements from the free text (dangerous goods,
   cold chain, etc.).
2. Routes the lane across the carrier's Transit Table — a fixed network of
   flights — possibly via connections, scoring routes by how many requested
   requirements they can satisfy, tie-broken by transit time.
3. Drafts an email to the Pricing team and waits for a human to approve
   sending it.
4. Gets a price recommendation (simulated for this build) and drafts a
   customer quote, again waiting for human approval before it goes out.
5. Waits for the customer's reply (simulated, or pasted in manually) and
   classifies it as acceptance or rejection.
6. On acceptance, logs the finalized proposal.

The whole pipeline is a single LangGraph state machine with the human
approvals as real pause points — not polling, not a separate ticket system.

## 2. The one rule everything else follows

**The LLM never computes a number that matters.** Routing is a graph search
over the Transit Table (plain Python). Pricing is a formula (plain Python).
Claude's only jobs are: pull structured requirements out of free text,
write the prose of an email around numbers it's handed, and classify a
reply as accept/reject. This is why the deterministic logic
(`transit_graph.py`, `pricing_heuristic.py`, `requirements_catalog.py`) is
split cleanly away from the LLM-calling code (`llm.py`, the `draft_*`
functions in `nodes.py`) — the former is unit-testable with zero API calls
and is the thing a human actually has to trust.

## 3. Component map

| File | Responsibility |
|---|---|
| `models.py` | Plain dataclasses: `TransitLeg`, `Lane`, `RouteResult`, `RequirementFulfillment`, `LaneEvaluation` |
| `transit_graph.py` | DFS over the Transit Table, requirement-fulfillment scoring |
| `requirements_catalog.py` | The 5 canonical requirement codes + keyword fallback matcher |
| `pricing_heuristic.py` | The pricing formula |
| `data_loader.py` | Loads the Transit Table CSV |
| `state.py` | `RfpState` — the TypedDict the graph operates on |
| `llm.py` | Thin `ChatAnthropic` wrapper: text/JSON calls, cost tracking, timeout |
| `email_sender.py` | SMTP send with a mocked (console-logged) fallback |
| `db.py` | SQLite: accepted-proposal log + an RFP index for the dashboard |
| `nodes.py` | One function per graph node |
| `graph.py` | Wires the nodes into a `StateGraph`, compiles with a `SqliteSaver` |
| `main.py` | FastAPI layer: routes, auth, rate limiting, concurrency lock |
| `frontend/` | React + TypeScript SPA |

## 4. The human-in-the-loop mechanism

This is the part that doesn't look like a typical CRUD app, so it's worth
explaining directly.

LangGraph's `interrupt()` function, called inside a node, pauses the whole
graph and returns control to the caller along with whatever value was
passed to it. The caller later resumes with `Command(resume=<value>)` on
the *same thread id*, and the graph picks up exactly where it paused —
across process restarts, because the state is checkpointed to SQLite after
every node.

The non-obvious part: a node containing `interrupt()` **re-runs from its
own top on every resume**, until it gets past the `interrupt()` call. So if
a node did an LLM call and *then* called `interrupt()`, that LLM call would
silently re-run on every resume. The fix used throughout `nodes.py` is to
split each approval gate into two nodes: a `draft_*` node that does the LLM
work once and saves the result into state, followed by an `await_*` node
that does nothing but read that saved draft and call `interrupt()`. This
was confirmed empirically against the installed LangGraph version before
being relied on, not assumed from documentation.

**What this replaces**: without a durable-workflow engine, the same
behavior would need a `status` column (`PENDING_PRICING_APPROVAL`, etc.), a
`POST /approve` endpoint that manually re-dispatches to "whatever comes
after this status," and care taken that re-running that dispatch logic
doesn't redo expensive work. That's the same problem, solved by hand,
usually worse — it's easy to forget a step, and the "resume from the right
place" logic becomes its own bug-prone state machine implemented in HTTP
handlers.

## 5. Why LangGraph (and the alternatives)

| Option | What it would have meant |
|---|---|
| **Hand-rolled FSM** (a dict of step functions + manual "current step" column) | Zero dependencies, but checkpointing/resume has to be built and tested from scratch — exactly the hard part LangGraph already solved |
| **Task queue** (Celery, RQ, Dramatiq) | Mature for async jobs, but needs a broker (Redis/RabbitMQ), and queues are built for retry-on-failure, not for "wait an indefinite, human-scale amount of time for an answer" |
| **Durable-workflow engines** (AWS Step Functions, Temporal.io, Azure Durable Functions) | Very close in spirit — purpose-built, more mature tooling (visual inspection, versioning) — but Step Functions pulls in a cloud dependency this build deliberately avoids, and Temporal needs its own server cluster to self-host |
| **LangGraph (chosen)** | Durable, resumable, pausable state machines backed by a single SQLite file — no broker, no cluster, and it's built around LLM-step workflows specifically, which is what this actually is |

## 6. Why FastAPI (and the alternatives)

- **Flask** would be simpler and more ubiquitous, but has no native request/
  response validation or OpenAPI generation — that would mean bolting on
  something like `flask-smorest` to get what FastAPI + Pydantic give for
  free (see `main.py`'s response models and the `/docs` Swagger UI).
- **Django + DRF** brings an ORM, admin panel, and migration system this
  project has no use for — too much surface area for an API this small.
- **A Node/Express backend** would mean two runtimes: LangGraph is Python,
  so the orchestration layer would still need a Python process either way,
  and a second language just adds a cross-process bridge for no benefit.

FastAPI was chosen because it's the same language as the graph (no bridge),
and its Pydantic integration pays for itself the moment you want typed
responses and auto-generated docs.

## 7. Why SQLite (and the alternatives)

SQLite backs two independent things: the LangGraph checkpointer
(`checkpoints.db`) and the proposals/RFP-index log (`proposals.db`). Both
are "just a file" — no server to install or manage, which matches a
local-first, single-process deployment target.

The real cost of that choice: a single shared `sqlite3` connection isn't
safe for concurrent access from multiple threads, and FastAPI runs sync
route handlers in a threadpool. `main.py` works around this with a
process-wide `threading.Lock()` around every graph read/write — correct,
but it means all graph operations are serialized within one process. It
does **not** scale across multiple worker processes, because they'd each
hold their own connection to the same file and contend at the OS file-lock
level instead.

**The upgrade path, if this ever needs real concurrency**: LangGraph ships
a Postgres-backed checkpointer as a drop-in replacement for `SqliteSaver` —
swapping `graph.py`'s few lines, not a rewrite. Postgres would also replace
`proposals.db` the same way SQLite replaced it originally. The tradeoff
avoided for now is exactly the one being deferred: a Postgres server to run
and manage, in exchange for concurrent-write safety this project's current
scale doesn't need.

## 8. Why React + TypeScript (and the alternatives)

- **Server-rendered templates** (e.g. Jinja2 + HTMX) would avoid a frontend
  build step and a second dev server entirely, and would fit a mostly-CRUD
  app like this reasonably well. The tradeoff is state management for
  anything interactive (the orchestration panel refreshing after an
  approval) gets noticeably clunkier without a client-side framework.
- **Vue or Svelte** are comparable in capability (Svelte ships a smaller
  bundle), but React's ecosystem and tooling are the most broadly known,
  which matters if this is ever handed off to someone else to maintain.

TypeScript end-to-end matters more than the framework choice here: the
shape of a `Lane`, `Message`, or `TraceEvent` is declared once in
`types.ts` and mirrors the Pydantic response models in `main.py` almost
field-for-field, so a backend shape change surfaces as a type error in the
frontend instead of a silent runtime mismatch.

## 9. Why Claude via `langchain-anthropic` (and the alternatives)

- **The Anthropic SDK directly** would mean hand-writing message formatting
  and retry logic with no LangGraph integration; `langchain-anthropic`
  wraps the same API but plugs straight into LangGraph nodes with no
  adapter code, which is the actual reason it was picked over the raw SDK.
- **A different model provider** (e.g. GPT-family models) is functionally
  interchangeable for this project's narrow use of the LLM — prose drafting
  and classification, never numeric computation — so the choice of Claude
  here is a cost/quality tradeoff at the Haiku tier, not a feature
  dependency.

## 10. Reliability and security measures

- **Deterministic core, LLM at the edges** (section 2) — the main defense
  against hallucinated numbers.
- **A process-wide lock** serializes all graph access (section 7).
- **`X-API-Key` auth**, off by default, on by setting `API_KEY`.
- **Rate limiting** (`slowapi`): 10/min on RFP creation, 20/min on resume,
  keyed by API key or IP — bounds cost from an LLM-driven endpoint being
  hit repeatedly.
- **A 30s timeout** on every Anthropic call, so a hung request can't block
  a thread indefinitely.
- **A lane cap** (20 per request) on `CreateRfpRequest`.
- **A short defensive instruction** in prompts that embed user-supplied
  free text, asking the model to treat it as data, not instructions — a
  mitigation for prompt injection, not a guarantee.
- **Baseline HTTP security headers** (`X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Cross-Origin-Resource-Policy`).

## 11. Known limitations (honest tradeoffs, not oversights)

- **SQLite's concurrency ceiling** (section 7) — fine at this scale, has a
  documented upgrade path if it isn't later.
- **The "real" customer-reply path is a manual paste**, not a live inbox
  integration — connecting a real mailbox (IMAP/webhook) is additional
  scope deliberately left out of this build.
- **Secrets live in a local `.env` file**, not a secrets manager — fine for
  local/single-operator use, not for a shared production deployment.
- **Only the graph itself has automated tests** (`tests/test_graph_flow.py`)
  — the FastAPI layer (status codes, auth, rate limiting) is verified
  manually, not under a committed test suite yet.
