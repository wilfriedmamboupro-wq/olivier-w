import { describe, expect, it } from "vitest";
import { render, screen } from "../test/customRender";
import StatusPill from "./StatusPill";

describe("StatusPill", () => {
  it.each([
    ["NEW", "New", "pill--info"],
    ["ROUTED", "Routed", "pill--info"],
    ["NEEDS_HUMAN_REVIEW", "Needs review", "pill--warn"],
    ["ACCEPTED", "Accepted", "pill--good"],
    ["REJECTED", "Rejected", "pill--bad"],
  ])("renders %s as '%s' with tone class %s", (status, label, toneClass) => {
    render(<StatusPill status={status} />);
    const pill = screen.getByText(label);
    expect(pill).toHaveClass("pill", toneClass);
  });

  it("falls back to the raw status with an info tone when the status is unknown", () => {
    render(<StatusPill status="SOMETHING_UNEXPECTED" />);
    const pill = screen.getByText("SOMETHING_UNEXPECTED");
    expect(pill).toHaveClass("pill", "pill--info");
  });
});
