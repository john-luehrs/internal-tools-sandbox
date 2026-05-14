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
        return [
            {"pattern": "Authentication failures", "defects": descriptions[:2] if descriptions else []},
            {"pattern": "UI rendering issues", "defects": descriptions[2:4] if len(descriptions) > 2 else []},
            {"pattern": "Data sync errors", "defects": descriptions[4:] if len(descriptions) > 4 else []},
        ]
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
        if len(records) >= 2:
            return [[records[0], records[1]]]
        return []
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
            "[MOCK LOG SUMMARY] Log analysis complete. Detected elevated ERROR rate in api-service "
            "(3x above baseline). 2 anomalous patterns identified: repeated auth failures and slow "
            "query warnings. Recommend reviewing auth-service config and database indexes."
        )
    client = _get_client()
    response = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        messages=[{
            "role": "user",
            "content": f"Summarize these logs for an ops engineer. Highlight errors and anomalies:\n\n{log_text[:3000]}"
        }],
        max_tokens=400,
    )
    return response.choices[0].message.content.strip()


def explain_anomaly(message: str, score: float) -> str:
    if _is_mock():
        return (
            f"[MOCK ANOMALY EXPLANATION] This log entry scored {score}/100 on the anomaly detector. "
            "Possible causes: unusual request pattern, service degradation, or configuration drift. "
            "Recommend: check recent deploys and upstream dependencies."
        )
    client = _get_client()
    response = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        messages=[{
            "role": "user",
            "content": f"This log entry has anomaly score {score}/100. Explain why it may be anomalous:\n\n{message}"
        }],
        max_tokens=250,
    )
    return response.choices[0].message.content.strip()
