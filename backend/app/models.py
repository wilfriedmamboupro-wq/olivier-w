from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class TransitLeg:
    origin: str
    destination: str
    transit_days: float
    requirements_available: list[str]  # canonical codes, e.g. ["DG", "HV"]


@dataclass(frozen=True)
class Lane:
    lane_id: str
    origin: str
    destination: str
    tons: float
    max_transit_days: float
    requirements_requested: list[str]
    shipper_note: str = ""


@dataclass
class RouteResult:
    legs: list[TransitLeg]
    total_transit_days: float
    found: bool  # False => no path exists in the transit network at all

    @property
    def airport_sequence(self) -> list[str]:
        if not self.legs:
            return []
        return [self.legs[0].origin] + [leg.destination for leg in self.legs]


@dataclass
class RequirementFulfillment:
    code: str
    label: str
    fulfilled: bool
    unsupported_legs: list[str] = field(default_factory=list)  # "ORD-DXB" style, only when not fulfilled


@dataclass
class LaneEvaluation:
    lane: Lane
    route: RouteResult
    within_max_transit: bool
    requirement_results: list[RequirementFulfillment]
    needs_human_review: bool
    review_reasons: list[str]

    @property
    def fully_feasible(self) -> bool:
        return (
            self.route.found
            and self.within_max_transit
            and all(r.fulfilled for r in self.requirement_results)
        )
