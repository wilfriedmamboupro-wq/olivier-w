"""Loads the carrier's Transit Table, a reference dataset shipped with the app."""
from __future__ import annotations

import csv
from pathlib import Path

from .models import TransitLeg
from .requirements_catalog import normalize_label_list


def load_transit_table(path: str | Path) -> list[TransitLeg]:
    legs = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            labels = [s.strip() for s in row["SpecialRequirementsAvailable"].split(";") if s.strip()]
            legs.append(
                TransitLeg(
                    origin=row["Origin"].strip(),
                    destination=row["Destination"].strip(),
                    transit_days=float(row["TransitDays"]),
                    requirements_available=normalize_label_list(labels),
                )
            )
    return legs


def load_default_transit_table() -> list[TransitLeg]:
    return load_transit_table(Path(__file__).resolve().parent / "data" / "transit_table.csv")
