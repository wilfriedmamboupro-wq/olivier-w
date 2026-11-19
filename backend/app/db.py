"""SQLite persistence: the accepted-proposal log and an RFP index for the dashboard."""
from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path

_DB_PATH = Path(os.environ.get("PROPOSALS_DB_PATH", Path(__file__).resolve().parent.parent / "proposals.db"))


def _connection() -> sqlite3.Connection:
    conn = sqlite3.connect(_DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS proposals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rfp_id TEXT NOT NULL,
            lane_id TEXT NOT NULL,
            origin TEXT NOT NULL,
            destination TEXT NOT NULL,
            tons REAL NOT NULL,
            route_airports TEXT NOT NULL,
            transit_days REAL NOT NULL,
            requirements_requested TEXT NOT NULL,
            requirements_fulfilled TEXT NOT NULL,
            price_per_ton REAL NOT NULL,
            total_price REAL NOT NULL,
            customer_email TEXT NOT NULL,
            accepted_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(rfp_id, lane_id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS rfp_index (
            rfp_id TEXT PRIMARY KEY,
            customer_name TEXT NOT NULL,
            customer_email TEXT NOT NULL,
            lane_count INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    return conn


def insert_rfp_index(rfp_id: str, customer_name: str, customer_email: str, lane_count: int) -> None:
    with _connection() as conn:
        conn.execute(
            "INSERT INTO rfp_index (rfp_id, customer_name, customer_email, lane_count) VALUES (?, ?, ?, ?)",
            (rfp_id, customer_name, customer_email, lane_count),
        )


def list_rfp_index() -> list[dict]:
    with _connection() as conn:
        conn.row_factory = sqlite3.Row
        return [dict(row) for row in conn.execute("SELECT * FROM rfp_index ORDER BY created_at DESC")]


def insert_proposal(
    rfp_id: str,
    lane_id: str,
    origin: str,
    destination: str,
    tons: float,
    route_airports: list[str],
    transit_days: float,
    requirements_requested: list[str],
    requirements_fulfilled: dict,
    price_per_ton: float,
    customer_email: str,
) -> int:
    with _connection() as conn:
        cur = conn.execute(
            """
            INSERT INTO proposals (
                rfp_id, lane_id, origin, destination, tons, route_airports, transit_days,
                requirements_requested, requirements_fulfilled, price_per_ton, total_price, customer_email
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                rfp_id,
                lane_id,
                origin,
                destination,
                tons,
                json.dumps(route_airports),
                transit_days,
                json.dumps(requirements_requested),
                json.dumps(requirements_fulfilled),
                price_per_ton,
                price_per_ton * tons,
                customer_email,
            ),
        )
        return cur.lastrowid


def list_proposals() -> list[dict]:
    with _connection() as conn:
        conn.row_factory = sqlite3.Row
        return [dict(row) for row in conn.execute("SELECT * FROM proposals ORDER BY id DESC")]
