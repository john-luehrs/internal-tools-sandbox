"""
AI client — wraps OpenAI with mock fallback.
All AI calls go through this module. PII scrubbing happens BEFORE calling here.
"""
import os
from dotenv import load_dotenv

load_dotenv()

_openai_client = None


def _get_client():
    global _openai_client
    if _openai_client is None:
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if api_key:
            from openai import OpenAI
            _openai_client = OpenAI(api_key=api_key)
    return _openai_client


def _is_mock() -> bool:
    return not os.getenv("OPENAI_API_KEY", "").strip()


def get_ai_summary(text: str, context: str = "") -> str:
    if _is_mock():
        return (
            f"[MOCK SUMMARY] This ticket describes an issue requiring attention. "
            f"Context: {context or 'standard support request'}. "
            "Recommended action: Review SLA tier and escalate if needed."
        )
    client = _get_client()
    prompt = f"{context}\n\nSummarize this concisely for a support agent:\n\n{text}" if context else text
    response = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        messages=[{"role": "user", "content": prompt}],
        max_tokens=300,
    )
    return response.choices[0].message.content.strip()


def cluster_defects(descriptions: list[str]) -> list[dict]:
    if _is_mock() or not descriptions:
        buckets = {
            "Checkout and Pricing Drift": ["checkout", "tax", "promo", "coupon", "pricing"],
            "Payment and Retry Idempotency": ["payment", "gateway", "retry", "duplicate order", "intent"],
            "Inventory and Fulfillment Timing": ["inventory", "reservation", "fulfillment", "warehouse", "sku"],
            "Event and Notification Ordering": ["notification", "event", "queue", "confirmation", "callback"],
        }
        grouped = {pattern: [] for pattern in buckets}
        misc = []

        for text in descriptions:
            lowered = text.lower()
            matched = False
            for pattern, keywords in buckets.items():
                if any(k in lowered for k in keywords):
                    grouped[pattern].append(text)
                    matched = True
                    break
            if not matched:
                misc.append(text)

        result = []
        for pattern, items in grouped.items():
            if items:
                result.append({"pattern": pattern, "defects": items})
        if misc:
            result.append({"pattern": "General Defect Drift", "defects": misc})
        return result
    client = _get_client()
    text = "\n".join(f"- {d}" for d in descriptions[:50])
    response = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        messages=[{
            "role": "user",
            "content": (
                "Group these defect descriptions into clusters by pattern. "
                "Return JSON array: [{\"pattern\": str, \"defects\": [str]}]\n\n" + text
            )
        }],
        max_tokens=800,
        response_format={"type": "json_object"},
    )
    import json
    data = json.loads(response.choices[0].message.content)
    return data.get("clusters", [])


def find_duplicates(records: list[dict]) -> list[list[dict]]:
    if _is_mock() or len(records) < 2:
        groups = []
        used = set()

        def _score(a: str, b: str) -> float:
            a_tokens = {tok for tok in a.lower().replace("-", " ").split() if len(tok) > 3}
            b_tokens = {tok for tok in b.lower().replace("-", " ").split() if len(tok) > 3}
            if not a_tokens or not b_tokens:
                return 0.0
            overlap = len(a_tokens & b_tokens)
            union = len(a_tokens | b_tokens)
            return overlap / union

        for i, rec in enumerate(records):
            if rec["defect_id"] in used:
                continue
            current = [rec]
            for j in range(i + 1, len(records)):
                other = records[j]
                if other["defect_id"] in used:
                    continue
                if _score(rec["description"], other["description"]) >= 0.5:
                    current.append(other)
                    used.add(other["defect_id"])
            if len(current) > 1:
                used.add(rec["defect_id"])
                groups.append(current)

        return groups
    client = _get_client()
    text = "\n".join(f"#{r['defect_id']}: {r['description']}" for r in records[:30])
    response = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        messages=[{
            "role": "user",
            "content": (
                "Identify groups of duplicate or near-duplicate defect descriptions. "
                "Return JSON: {\"groups\": [[defect_id, ...], ...]}\n\n" + text
            )
        }],
        max_tokens=600,
        response_format={"type": "json_object"},
    )
    import json
    data = json.loads(response.choices[0].message.content)
    groups = data.get("groups", [])
    record_map = {r["defect_id"]: r for r in records}
    return [[record_map[id] for id in g if id in record_map] for g in groups if len(g) > 1]


def summarize_logs(log_text: str) -> str:
    if _is_mock():
        return (
            "1) Executive Summary: Elevated operational risk detected in the current log slice, with repeated "
            "error-level signals and anomaly-prone behavior in core services. Immediate triage is recommended.\n\n"
            "2) Top Signals:\n"
            "- Repeated authentication failures suggest access-path instability.\n"
            "- Slow query and timeout patterns indicate potential database or dependency pressure.\n"
            "- Error frequency appears above normal background noise for routine operations.\n\n"
            "3) Possible Blast Radius: User login reliability, API request latency, and downstream workflow throughput "
            "may be impacted if error patterns persist.\n\n"
            "4) Immediate Actions:\n"
            "- Check auth-service error rate and token validation failures in the last 15 minutes.\n"
            "- Validate database latency, connection pool usage, and recent slow-query fingerprints.\n"
            "- Review recent deploy/config changes for affected services and compare with incident onset.\n\n"
            "5) Escalation Recommendation: Yes - multi-signal errors across critical paths warrant active monitoring "
            "and potential incident escalation if trends continue."
        )
    client = _get_client()
    prompt = (
        "You are an on-call operations engineer triaging production logs. "
        "Use only the provided log lines. Do not invent deploy events, traffic changes, or system context "
        "that is not present in the logs. Keep the response concise and action-oriented.\n\n"
        "Return exactly these sections:\n"
        "1) Executive Summary: 1-2 sentences.\n"
        "2) Top Signals: up to 3 bullet points for highest-risk errors/anomalies.\n"
        "3) Possible Blast Radius: what services/users might be affected based on evidence in logs.\n"
        "4) Immediate Actions: exactly 3 concrete checks to run now.\n"
        "5) Escalation Recommendation: Yes or No with one short reason.\n\n"
        f"Logs to analyze:\n{log_text[:3000]}"
    )
    response = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        messages=[{
            "role": "user",
            "content": prompt
        }],
        max_tokens=500,
    )
    return response.choices[0].message.content.strip()


def explain_anomaly(message: str, score: float) -> str:
    if _is_mock():
        return (
            "1) Likely Cause: The event appears anomalous because it combines error-like behavior with patterns that "
            "typically indicate service stress or unexpected request flow.\n\n"
            f"2) Confidence: Medium - anomaly score is {score}/100, which suggests elevated risk but not definitive "
            "root-cause certainty from a single log line.\n\n"
            "3) Immediate Checks:\n"
            "- Correlate this log with service error/latency metrics in the same time window.\n"
            "- Inspect recent deploy and configuration changes for the affected component.\n"
            "- Check upstream/downstream dependency health for retries, timeouts, or saturation.\n\n"
            "4) Escalation Recommendation: No - begin targeted triage first; escalate if repeated similar anomalies "
            "or customer impact is confirmed."
        )
    client = _get_client()
    prompt = (
        "You are an on-call operations engineer reviewing a potentially anomalous production log. "
        "Base your assessment only on the provided message and score. "
        "Do not invent systems, metrics, or deploy history.\n\n"
        f"Anomaly score: {score}/100\n"
        f"Log message: {message}\n\n"
        "Return a concise response with these sections:\n"
        "1) Likely Cause: one short paragraph.\n"
        "2) Confidence: low, medium, or high with one sentence why.\n"
        "3) Immediate Checks: exactly 3 concrete checks an ops engineer should run now.\n"
        "4) Escalation Recommendation: Yes or No, with a short reason."
    )
    response = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        messages=[{
            "role": "user",
            "content": prompt
        }],
        max_tokens=320,
    )
    return response.choices[0].message.content.strip()


def generate_ops_brief(context: dict) -> str:
    """Manager-only AI brief. Always uses safe mode (no raw log messages sent)."""
    workload = context.get("workload_per_engineer", [])
    workload_lines = "\n".join(
        f"  - {r['assigned_to']}: {r['total']} assigned "
        f"({r['unreviewed']} unreviewed, {r['in_review']} in review, {r['resolved']} resolved)"
        for r in workload
    ) or "  - No assigned logs"

    oldest = context.get("oldest_unreviewed_timestamp") or "none"
    ctx_text = (
        f"High-anomaly logs: {context.get('high_anomaly_total', 0)}\n"
        f"Unassigned high-anomaly: {context.get('unassigned', 0)}\n"
        f"In review: {context.get('in_review', 0)}\n"
        f"Resolved: {context.get('resolved', 0)}\n"
        f"Oldest unreviewed (assigned): {oldest}\n"
        f"Workload per engineer:\n{workload_lines}"
    )

    if _is_mock():
        return (
            "1) System Health Posture: Operational risk is elevated — high-anomaly queue has open items and "
            "unassigned logs indicate potential triage gaps. Overall system appears under moderate pressure.\n\n"
            "2) Queue Summary:\n"
            f"- {context.get('high_anomaly_total', 0)} high-anomaly logs tracked; "
            f"{context.get('unassigned', 0)} remain unassigned.\n"
            f"- {context.get('in_review', 0)} logs currently in active review.\n"
            f"- {context.get('resolved', 0)} logs resolved.\n\n"
            "3) Workload Distribution:\n"
            + workload_lines + "\n\n"
            "4) Workflow Pain Points:\n"
            "- Unassigned high-anomaly logs represent a coverage gap; consider rotating on-call ownership.\n"
            "- Oldest unreviewed ticket age may indicate SLA risk if not yet claimed.\n"
            "- Workload imbalance between engineers may slow average time-to-first-review.\n\n"
            "5) Recommended Actions:\n"
            "- Assign all unassigned high-anomaly logs immediately.\n"
            "- Check engineers with high unreviewed counts for blockers.\n"
            "- Review oldest unreviewed ticket to confirm it is not silently aging past SLA."
        )

    client = _get_client()
    prompt = (
        "You are a senior operations manager reviewing the current state of your team's log triage queue. "
        "Use only the provided workload data. Do not invent specifics about engineers, systems, or incidents.\n\n"
        "Queue data:\n"
        f"{ctx_text}\n\n"
        "Return exactly these sections:\n"
        "1) System Health Posture: 1-2 sentences on overall risk level.\n"
        "2) Queue Summary: key queue metrics in 3 bullet points.\n"
        "3) Workload Distribution: brief assessment of per-engineer balance.\n"
        "4) Workflow Pain Points: up to 3 bullet points on process gaps visible in this data.\n"
        "5) Recommended Actions: exactly 3 concrete actions for the manager to take now."
    )
    response = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        messages=[{"role": "user", "content": prompt}],
        max_tokens=500,
    )
    return response.choices[0].message.content.strip()
