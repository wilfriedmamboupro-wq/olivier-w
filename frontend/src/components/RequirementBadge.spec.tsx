import { describe, expect, it } from "vitest";
import { render, screen } from "../test/customRender";
import RequirementBadge from "./RequirementBadge";
import type { RequirementResult } from "../types";

describe("RequirementBadge", () => {
  it("marks a fulfilled requirement with a check and an 'available' title", () => {
    const requirement: RequirementResult = {
      code: "DG",
      label: "Dangerous Goods Handling",
      fulfilled: true,
      unsupported_legs: [],
    };
    render(<RequirementBadge requirement={requirement} />);

    const badge = screen.getByText("Dangerous Goods Handling").closest("span");
    expect(badge).toHaveClass("req-badge--ok");
    expect(badge).toHaveAttribute("title", "Dangerous Goods Handling: available on the chosen route");
    expect(screen.getByText("fulfilled")).toBeInTheDocument();
  });

  it("marks an unfulfilled requirement with the unsupported legs in the title", () => {
    const requirement: RequirementResult = {
      code: "CC",
      label: "Cold Chain (2-8C)",
      fulfilled: false,
      unsupported_legs: ["ORD-DXB", "DXB-HKG"],
    };
    render(<RequirementBadge requirement={requirement} />);

    const badge = screen.getByText("Cold Chain (2-8C)").closest("span");
    expect(badge).toHaveClass("req-badge--blocked");
    expect(badge).toHaveAttribute("title", "Cold Chain (2-8C): not available on leg(s) ORD-DXB, DXB-HKG");
    expect(screen.getByText("not fulfilled")).toBeInTheDocument();
  });
});
