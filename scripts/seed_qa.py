"""Seed QA defects database with ecommerce-focused synthetic defects."""
import os
import random
import sqlite3
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(__file__), "../db/qa.db")

SPRINT_PLAN = [
    ("S510", 18),
    ("S511", 24),
    ("S512", 15),
    ("S513", 27),
    ("S514", 19),
]

SPRINT_METADATA = {
    "S510": {
        "modules_deployed": "checkout,payment_gateway,notifications",
        "deploy_success_count": 17,
        "deploy_error_count": 2,
    },
    "S511": {
        "modules_deployed": "inventory_service,promotions_engine,checkout",
        "deploy_success_count": 22,
        "deploy_error_count": 4,
    },
    "S512": {
        "modules_deployed": "order_events,notifications,account_auth",
        "deploy_success_count": 14,
        "deploy_error_count": 1,
    },
    "S513": {
        "modules_deployed": "payment_gateway,inventory_service,fulfillment_pipeline",
        "deploy_success_count": 23,
        "deploy_error_count": 5,
    },
    "S514": {
        "modules_deployed": "checkout,promotions_engine,order_events",
        "deploy_success_count": 18,
        "deploy_error_count": 2,
    },
}

COMPONENTS = [
    "checkout",
    "payment_gateway",
    "inventory_service",
    "promotions_engine",
    "order_events",
    "fulfillment_pipeline",
    "notifications",
    "account_auth",
    "risk_scoring",
    "shipping_rates",
]

SEVERITY_WEIGHTS = [
    ("critical", 0.1),
    ("high", 0.25),
    ("medium", 0.45),
    ("low", 0.2),
]

ASSIGNEES = ["quinn", "riley", "taylor", "morgan"]
REPORTERS = ["qa_automation", "manual_qa", "support_triage", "release_ops"]

PATTERNS = [
    {
        "component": "checkout",
        "weight": 0.19,
        "title": "Tax total mismatch between cart and checkout",
        "description": "Cart total differs from final checkout total when shipping ZIP is changed late in flow.",
        "repro_steps": "Add taxable items; apply shipping address change at payment step; compare totals.",
        "expected_result": "Checkout and cart totals stay consistent after recalculation.",
        "actual_result": "Checkout total recalculates, cart summary remains stale.",
        "impact": "Customer confusion and cart abandonment risk.",
        "tags": "checkout,tax,pricing",
    },
    {
        "component": "payment_gateway",
        "weight": 0.18,
        "title": "Duplicate order creation after payment retry",
        "description": "Gateway timeout retry path creates a second order with same payment intent.",
        "repro_steps": "Trigger gateway timeout; click retry; inspect order ledger for duplicate entries.",
        "expected_result": "Retry is idempotent and updates existing order.",
        "actual_result": "A new order row is created for retry submission.",
        "impact": "Duplicate order notifications and potential duplicate charges.",
        "tags": "payments,idempotency,retry",
    },
    {
        "component": "inventory_service",
        "weight": 0.16,
        "title": "Inventory reservation race during peak load",
        "description": "Concurrent carts reserve the same SKU and one order fails late at submit.",
        "repro_steps": "Run two sessions on same low-stock SKU; submit simultaneously.",
        "expected_result": "Only one reservation succeeds and second user is blocked earlier.",
        "actual_result": "Second user fails only at final submit with generic error.",
        "impact": "Checkout failures and increased support contacts.",
        "tags": "inventory,concurrency,checkout",
    },
    {
        "component": "promotions_engine",
        "weight": 0.14,
        "title": "Promo stack rule ignored for free-shipping coupon",
        "description": "Discount and free-shipping coupons apply together when policy allows only one.",
        "repro_steps": "Apply SAVE20 and FREESHIP on same cart; inspect discount breakdown.",
        "expected_result": "Engine rejects second coupon based on stack rule.",
        "actual_result": "Both coupons apply and reduce margin beyond policy.",
        "impact": "Revenue leakage and manual finance adjustments.",
        "tags": "promo,discount,pricing",
    },
    {
        "component": "notifications",
        "weight": 0.13,
        "title": "Order confirmation sent before fulfillment event",
        "description": "Notification pipeline emits confirmation before warehouse sync completes.",
        "repro_steps": "Place order during queue backpressure; inspect event timestamps.",
        "expected_result": "Confirmation is sent after fulfillment event persists.",
        "actual_result": "Customer receives confirmation before fulfillment state exists.",
        "impact": "Customer trust impact and support escalations.",
        "tags": "events,notification,fulfillment",
    },
    {
        "component": "order_events",
        "weight": 0.12,
        "title": "Refund status drift between UI and gateway",
        "description": "UI shows refund complete while gateway remains pending.",
        "repro_steps": "Initiate refund with delayed gateway callback; compare UI and gateway logs.",
        "expected_result": "UI remains pending until gateway confirmation.",
        "actual_result": "UI transitions to complete without callback.",
        "impact": "Incorrect customer comms and finance reconciliation overhead.",
        "tags": "refund,events,status",
    },
    {
        "component": "risk_scoring",
        "weight": 0.04,
        "active_sprints": ["S511", "S513"],
        "title": "Fraud score spike blocks legitimate repeat buyers",
        "description": "Fraud model lifts trusted customer score after second payment attempt in same session.",
        "repro_steps": "Use customer with successful prior orders; retry card after forced timeout; verify risk decision.",
        "expected_result": "Known trusted profiles should not be auto-blocked on retry without additional risk signals.",
        "actual_result": "Second attempt is hard-blocked and checkout exits with generic fraud rejection.",
        "impact": "False positives reduce conversion for loyal customers.",
        "tags": "fraud,risk,checkout",
    },
    {
        "component": "shipping_rates",
        "weight": 0.04,
        "active_sprints": ["S512", "S514"],
        "title": "Carrier rate cache stale after zone update",
        "description": "Shipping quote service keeps outdated rate card after zone mapping rollout.",
        "repro_steps": "Price the same cart for two nearby ZIPs after zone update; compare returned carrier rates.",
        "expected_result": "Rate service should invalidate cache and return updated zone-specific prices.",
        "actual_result": "Returned quote uses old zone data for up to 45 minutes.",
        "impact": "Incorrect shipping quotes increase checkout drop-off and support refunds.",
        "tags": "shipping,rates,cache",
    },
]

DESC_SUFFIXES = [
    "Observed in staging replay.",
    "Seen again after last patch.",
    "First reported by support escalation.",
    "Correlates with elevated retry traffic.",
    "Reproduced with synthetic load profile.",
    "Impacts guest and authenticated flows.",
]

REPRO_PREFIXES = [
    "From a clean browser session,",
    "Using a previously saved cart,",
    "With throttled network enabled,",
    "After cache clear and re-login,",
]

TITLE_VARIANTS = [
    "core path",
    "edge case",
    "regression candidate",
    "high-volume scenario",
]


def pick_severity() -> str:
    roll = random.random()
    cumulative = 0.0
    for severity, weight in SEVERITY_WEIGHTS:
        cumulative += weight
        if roll <= cumulative:
            return severity
    return "medium"


def pick_status(severity: str) -> tuple[str, str | None]:
    if severity in ("critical", "high"):
        options = ["open", "investigating", "escalated", "duplicate_pending"]
    else:
        options = ["open", "investigating", "resolved", "duplicate_pending"]

    status = random.choice(options)
    if status == "resolved":
        return status, random.choice(["fixed", "follow_up_created", "not_reproducible"])
    return status, None


def normalize_sentence(text: str) -> str:
    normalized = (text or "").strip()
    if not normalized:
        return ""
    normalized = normalized[0].upper() + normalized[1:]
    if normalized[-1] not in ".!?":
        normalized += "."
    return normalized


def build_variant(pattern: dict, sprint_id: str, index: int) -> tuple[str, str, str, str, str]:
    title = f"{pattern['title']} - {random.choice(TITLE_VARIANTS)} ({sprint_id}-{index + 1})"
    description = f"{pattern['description']} {random.choice(DESC_SUFFIXES)}"
    repro = f"{random.choice(REPRO_PREFIXES)} {pattern['repro_steps']}"
    expected_base = normalize_sentence(pattern["expected_result"])
    actual_base = normalize_sentence(pattern["actual_result"])
    expected = expected_base
    actual = actual_base
    return title, description, repro, expected, actual


def build_seed_rows() -> list[tuple]:
    random.seed(42)
    rows = []
    defect_id = 1
    start = datetime(2026, 1, 6, 9, 0, 0)

    for sprint_idx, (sprint_id, count) in enumerate(SPRINT_PLAN):
        active_patterns = [
            pattern
            for pattern in PATTERNS
            if not pattern.get("active_sprints") or sprint_id in pattern["active_sprints"]
        ]
        active_weights = [pattern["weight"] for pattern in active_patterns]
        sprint_rare_patterns = [pattern for pattern in active_patterns if pattern.get("active_sprints")]

        for n in range(count):
            # Force at least one occurrence of each sprint-specific rare cluster.
            if n < len(sprint_rare_patterns):
                pattern = sprint_rare_patterns[n]
            else:
                pattern = random.choices(active_patterns, weights=active_weights, k=1)[0]
            severity = pick_severity()
            status, resolution_reason = pick_status(severity)
            created_at = start + timedelta(days=sprint_idx * 14, hours=n)
            title_variant, description_variant, repro_variant, expected_variant, actual_variant = build_variant(pattern, sprint_id, n)
            rows.append(
                (
                    defect_id,
                    sprint_id,
                    pattern["component"],
                    severity,
                    status,
                    resolution_reason,
                    random.choice(ASSIGNEES),
                    random.choice(REPORTERS),
                    title_variant,
                    description_variant,
                    repro_variant,
                    expected_variant,
                    actual_variant,
                    pattern["impact"],
                    pattern["tags"],
                    created_at.isoformat() + "Z",
                    created_at.isoformat() + "Z",
                    None,
                )
            )
            defect_id += 1

    return rows


def seed_qa() -> None:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DROP TABLE IF EXISTS defects")
    conn.execute("DROP TABLE IF EXISTS sprints")
    conn.execute("DROP TABLE IF EXISTS defect_triage_notes")
    conn.execute("DROP TABLE IF EXISTS defect_merge_actions")

    conn.execute(
        """
        CREATE TABLE defects (
            defect_id INTEGER PRIMARY KEY,
            sprint_id TEXT NOT NULL,
            component TEXT NOT NULL,
            severity TEXT NOT NULL,
            status TEXT NOT NULL,
            resolution_reason TEXT,
            assignee TEXT,
            reporter TEXT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            repro_steps TEXT,
            expected_result TEXT,
            actual_result TEXT,
            customer_impact TEXT,
            tags TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            canonical_defect_id INTEGER
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE sprints (
            sprint_id TEXT PRIMARY KEY,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            release_label TEXT NOT NULL,
            modules_deployed TEXT,
            deploy_success_count INTEGER DEFAULT 0,
            deploy_error_count INTEGER DEFAULT 0
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE defect_triage_notes (
            note_id INTEGER PRIMARY KEY AUTOINCREMENT,
            defect_id INTEGER NOT NULL,
            author TEXT NOT NULL,
            note_body TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )

    conn.execute(
        """
        CREATE TABLE defect_merge_actions (
            merge_id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_defect_id INTEGER NOT NULL,
            canonical_defect_id INTEGER NOT NULL,
            confidence_score REAL,
            reason TEXT,
            approved_by TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )

    sprint_rows = []
    sprint_start = datetime(2026, 1, 6)
    for idx, (sprint_id, _count) in enumerate(SPRINT_PLAN):
        start_date = sprint_start + timedelta(days=idx * 14)
        end_date = start_date + timedelta(days=13)
        meta = SPRINT_METADATA.get(sprint_id, {})
        sprint_rows.append(
            (
                sprint_id,
                start_date.date().isoformat(),
                end_date.date().isoformat(),
                f"2026.R{idx + 1}",
                meta.get("modules_deployed", ""),
                meta.get("deploy_success_count", 0),
                meta.get("deploy_error_count", 0),
            )
        )

    conn.executemany(
        """
        INSERT INTO sprints (
            sprint_id,
            start_date,
            end_date,
            release_label,
            modules_deployed,
            deploy_success_count,
            deploy_error_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        sprint_rows,
    )

    conn.executemany(
        """
        INSERT INTO defects (
            defect_id,
            sprint_id,
            component,
            severity,
            status,
            resolution_reason,
            assignee,
            reporter,
            title,
            description,
            repro_steps,
            expected_result,
            actual_result,
            customer_impact,
            tags,
            created_at,
            updated_at,
            canonical_defect_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        build_seed_rows(),
    )

    conn.commit()
    conn.close()


if __name__ == "__main__":
    seed_qa()
    print("qa.db seeded with ecommerce QA defects.")
