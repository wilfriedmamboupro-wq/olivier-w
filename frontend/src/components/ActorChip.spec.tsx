import { describe, expect, it } from "vitest";
import { render, screen } from "../test/customRender";
import ActorChip from "./ActorChip";
import type { Actor } from "../types";

describe("ActorChip", () => {
  it.each<[Actor, string]>([
    ["claude", "Claude"],
    ["human", "Human"],
    ["system", "System"],
  ])("renders the %s label", (actor, label) => {
    render(<ActorChip actor={actor} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("applies the actor-specific class", () => {
    render(<ActorChip actor="human" />);
    expect(screen.getByText("Human")).toHaveClass("actor-chip", "actor-chip--human");
  });
});
