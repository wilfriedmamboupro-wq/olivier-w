import { describe, expect, it } from "vitest";
import { render, screen } from "../test/customRender";
import OrchestrationTrace from "./OrchestrationTrace";
import type { TraceEvent } from "../domain/rfp";

describe("OrchestrationTrace", () => {
  it("shows an empty-state message when there are no trace events", () => {
    render(<OrchestrationTrace trace={[]} />);
    expect(screen.getByText("No orchestration steps yet.")).toBeInTheDocument();
  });

  it("renders each event's step, summary, and actor chip", () => {
    const trace: TraceEvent[] = [
      { step: "ingest_and_route", status: "done", summary: "Routed 1 lane(s)", actor: "claude" },
      { step: "await_pricing_approval", status: "needs_human", summary: "Waiting on approval", actor: "human" },
    ];
    render(<OrchestrationTrace trace={trace} />);

    expect(screen.getByText("ingest_and_route")).toBeInTheDocument();
    expect(screen.getByText("Routed 1 lane(s)")).toBeInTheDocument();
    expect(screen.getByText("Claude")).toBeInTheDocument();

    expect(screen.getByText("await_pricing_approval")).toBeInTheDocument();
    expect(screen.getByText("Waiting on approval")).toBeInTheDocument();
    expect(screen.getByText("Human")).toBeInTheDocument();
  });

  it("gives each step's status dot a matching modifier class", () => {
    const trace: TraceEvent[] = [{ step: "finalize_accept", status: "error", summary: "Email send failed", actor: "system" }];
    const { container } = render(<OrchestrationTrace trace={trace} />);

    expect(container.querySelector(".trace-item__dot--error")).not.toBeNull();
  });
});
