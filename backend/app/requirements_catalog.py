"""Canonical special-requirement vocabulary shared by RFP parsing, the Transit
Table, and requirement-fulfillment checks.

The Bedrock-based parser (see handlers/parse_rfp.py) is the primary extractor
in production -- free text can be phrased in ways no keyword list anticipates.
``extract_requirements`` below is a deterministic fallback/validator: it lets
us unit-test the routing + fulfillment logic without calling Bedrock, and it
normalizes whatever the LLM returns onto this fixed set of codes so downstream
logic never has to deal with free-text requirement names.
"""
from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Requirement:
    code: str
    label: str


DANGEROUS_GOODS = Requirement("DG", "Dangerous Goods Handling")
HIGH_VALUE_SECURITY = Requirement("HV", "High-Value Security")
FRAGILE_HANDLING = Requirement("FR", "Fragile Handling")
OVERSIZED_CARGO = Requirement("OS", "Oversized Cargo")
COLD_CHAIN = Requirement("CC", "Cold Chain (2-8C)")

ALL_REQUIREMENTS = [DANGEROUS_GOODS, HIGH_VALUE_SECURITY, FRAGILE_HANDLING, OVERSIZED_CARGO, COLD_CHAIN]
BY_CODE = {r.code: r for r in ALL_REQUIREMENTS}

# Order matters only in that "standard general cargo" short-circuits to no
# requirements; everything else is matched independently since a lane can ask
# for several special requirements at once.
_KEYWORD_PATTERNS: list[tuple[Requirement, re.Pattern]] = [
    (DANGEROUS_GOODS, re.compile(r"dangerous[\s-]?goods", re.I)),
    (HIGH_VALUE_SECURITY, re.compile(r"high[\s-]?value|secure handling|security throughout", re.I)),
    (FRAGILE_HANDLING, re.compile(r"fragile", re.I)),
    (OVERSIZED_CARGO, re.compile(r"oversiz", re.I)),
    (COLD_CHAIN, re.compile(r"2[\s-]?(?:to|and|-)?[\s-]?8|cold chain|refrigerat", re.I)),
]

_STANDARD_PATTERN = re.compile(r"standard general cargo|no special services|nothing special", re.I)


def extract_requirements(free_text: str) -> list[str]:
    """Return canonical requirement codes mentioned in free text.

    Empty list means "standard general cargo" -- no special handling requested.
    """
    if _STANDARD_PATTERN.search(free_text):
        return []
    found = [req.code for req, pattern in _KEYWORD_PATTERNS if pattern.search(free_text)]
    return found


def normalize_label_list(labels: list[str]) -> list[str]:
    """Map a list of free-text requirement labels (e.g. from the Transit Table
    or an LLM response) onto canonical codes, dropping anything unrecognized."""
    codes: list[str] = []
    for label in labels:
        for req, pattern in _KEYWORD_PATTERNS:
            if pattern.search(label) and req.code not in codes:
                codes.append(req.code)
    return codes


def labels_for(codes: list[str]) -> list[str]:
    return [BY_CODE[c].label for c in codes if c in BY_CODE]
