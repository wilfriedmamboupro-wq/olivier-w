"""Routing engine over the carrier's Transit Table.

A lane may need several legs since not every origin-destination pair has a
direct flight. Simple paths are enumerated (bounded to MAX_LEGS hops -- the
network is small, ~20 airports, so this is cheap) and scored by how many of
the shipper's requested special requirements they can fulfill end-to-end,
tie-broken by total transit time, rather than by time alone.
"""
from __future__ import annotations

from collections import defaultdict

from .models import Lane, LaneEvaluation, RequirementFulfillment, RouteResult, TransitLeg
from .requirements_catalog import BY_CODE

MAX_LEGS = 4


class TransitGraph:
    def __init__(self, legs: list[TransitLeg]):
        self._adjacency: dict[str, list[TransitLeg]] = defaultdict(list)
        for leg in legs:
            self._adjacency[leg.origin].append(leg)

    def airports(self) -> set[str]:
        airports = set(self._adjacency.keys())
        for legs in self._adjacency.values():
            airports.update(leg.destination for leg in legs)
        return airports

    def find_simple_paths(self, origin: str, destination: str, max_legs: int = MAX_LEGS) -> list[list[TransitLeg]]:
        """DFS over simple paths (no repeated airport) up to max_legs hops."""
        results: list[list[TransitLeg]] = []

        def dfs(current: str, visited: set[str], path: list[TransitLeg]):
            if len(path) > max_legs:
                return
            if current == destination and path:
                results.append(list(path))
                return
            for leg in self._adjacency.get(current, []):
                if leg.destination in visited:
                    continue
                visited.add(leg.destination)
                path.append(leg)
                dfs(leg.destination, visited, path)
                path.pop()
                visited.remove(leg.destination)

        dfs(origin, {origin}, [])
        return results


def _requirement_fulfillment(path: list[TransitLeg], requested_codes: list[str]) -> list[RequirementFulfillment]:
    results = []
    for code in requested_codes:
        unsupported = [f"{leg.origin}-{leg.destination}" for leg in path if code not in leg.requirements_available]
        results.append(
            RequirementFulfillment(
                code=code,
                label=BY_CODE[code].label,
                fulfilled=not unsupported,
                unsupported_legs=unsupported,
            )
        )
    return results


def _score(path: list[TransitLeg], total_days: float, requested_codes: list[str]) -> tuple[int, float]:
    fulfilled_count = sum(
        1 for code in requested_codes if all(code in leg.requirements_available for leg in path)
    )
    return (-fulfilled_count, total_days)  # sort ascending => most fulfilled, then fastest


def evaluate_lane(graph: TransitGraph, lane: Lane) -> LaneEvaluation:
    all_paths = graph.find_simple_paths(lane.origin, lane.destination)

    if not all_paths:
        return LaneEvaluation(
            lane=lane,
            route=RouteResult(legs=[], total_transit_days=0, found=False),
            within_max_transit=False,
            requirement_results=_requirement_fulfillment([], lane.requirements_requested),
            needs_human_review=True,
            review_reasons=[
                f"No flight path exists between {lane.origin} and {lane.destination} in the transit network -- "
                "requires a manual routing decision (e.g. interline/trucking partner) outside this system."
            ],
        )

    scored = [
        (p, sum(leg.transit_days for leg in p)) for p in all_paths
    ]
    within_budget = [(p, days) for p, days in scored if days <= lane.max_transit_days]

    reasons: list[str] = []
    if within_budget:
        candidates = within_budget
    else:
        # No path meets the customer's max transit time; surface the fastest
        # available path anyway so the human reviewer has something concrete
        # to negotiate from, but flag it clearly.
        candidates = scored
        fastest_days = min(days for _, days in scored)
        reasons.append(
            f"Fastest available route takes {fastest_days:g} days, exceeding the customer's "
            f"{lane.max_transit_days:g}-day requirement -- needs human decision (renegotiate transit time or price)."
        )

    best_path, best_days = min(candidates, key=lambda pd: _score(pd[0], pd[1], lane.requirements_requested))

    requirement_results = _requirement_fulfillment(best_path, lane.requirements_requested)
    unfulfilled = [r for r in requirement_results if not r.fulfilled]
    for r in unfulfilled:
        reasons.append(
            f"'{r.label}' cannot be guaranteed on leg(s) {', '.join(r.unsupported_legs)} -- "
            "needs human decision (alternate routing, partner carrier, or customer waiver)."
        )

    return LaneEvaluation(
        lane=lane,
        route=RouteResult(legs=best_path, total_transit_days=best_days, found=True),
        within_max_transit=best_days <= lane.max_transit_days,
        requirement_results=requirement_results,
        needs_human_review=bool(reasons),
        review_reasons=reasons,
    )
