import { describe, expect, it } from "vitest";
import { render, screen } from "../test/customRender";
import LaneTable from "./LaneTable";
import type { Lane } from "../domain/rfp";

function makeLane(overrides: Partial<Lane> = {}): Lane {
  return {
    lane_id: "L001",
    origin: "JFK",
    destination: "LHR",
    tons: 5,
    max_transit_days: 3,
    shipper_note: "",
    requirements_requested: [],
    route_airports: ["JFK", "LHR"],
    route_transit_days: 1,
    requirement_results: [],
    price_per_ton: null,
    status: "ROUTED",
    needs_human_review: false,
    review_reasons: [],
    ...overrides,
  };
}

describe("LaneTable", () => {
  it("shows the routed airport sequence when a route was found", () => {
    render(<LaneTable lanes={[makeLane({ route_airports: ["JFK", "ORD", "LHR"] })]} />);
    expect(screen.getByText("L001 · JFK → ORD → LHR")).toBeInTheDocument();
  });

  it("falls back to origin → destination when no route was found", () => {
    render(<LaneTable lanes={[makeLane({ route_airports: [] })]} />);
    expect(screen.getByText("L001 · JFK → LHR")).toBeInTheDocument();
  });

  it("formats tons, transit days, and a pending price", () => {
    render(<LaneTable lanes={[makeLane({ tons: 5, route_transit_days: 1.5, max_transit_days: 3, price_per_ton: null })]} />);
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("1.5d")).toBeInTheDocument();
    expect(screen.getByText(/max 3d/)).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("shows an em dash for transit days when the lane hasn't been routed", () => {
    render(<LaneTable lanes={[makeLane({ route_transit_days: 0 })]} />);
    expect(screen.getByText("—d")).toBeInTheDocument();
  });

  it("formats a set price as USD currency", () => {
    render(<LaneTable lanes={[makeLane({ price_per_ton: 1280 })]} />);
    expect(screen.getByText("$1,280.00")).toBeInTheDocument();
  });

  it("shows 'Standard general cargo' when no special requirements were requested", () => {
    render(<LaneTable lanes={[makeLane({ requirement_results: [] })]} />);
    expect(screen.getByText("Standard general cargo")).toBeInTheDocument();
  });

  it("renders a badge for each requirement result", () => {
    const lane = makeLane({
      requirement_results: [
        { code: "DG", label: "Dangerous Goods Handling", fulfilled: true, unsupported_legs: [] },
        { code: "CC", label: "Cold Chain (2-8C)", fulfilled: false, unsupported_legs: ["ORD-DXB"] },
      ],
    });
    render(<LaneTable lanes={[lane]} />);
    expect(screen.getByText("Dangerous Goods Handling")).toBeInTheDocument();
    expect(screen.getByText("Cold Chain (2-8C)")).toBeInTheDocument();
  });

  it("lists review reasons only when the lane has any", () => {
    const { rerender } = render(<LaneTable lanes={[makeLane({ review_reasons: [] })]} />);
    expect(screen.queryByRole("list")).toBeNull();

    rerender(<LaneTable lanes={[makeLane({ review_reasons: ["No flight path exists between JFK and LHR."] })]} />);
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByText("No flight path exists between JFK and LHR.")).toBeInTheDocument();
  });
});
