import unittest

from fastapi.testclient import TestClient

from services.api import app
from scripts.seed_logs import seed_logs
from scripts.seed_qa import seed_qa
from scripts.seed_support import seed_support


class ApiSmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        # Keep tests deterministic by reseeding local DBs used by API routes.
        seed_support()
        seed_logs()
        seed_qa()
        cls.client = TestClient(app)

    def test_health(self) -> None:
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json().get("status"), "ok")

    def test_support_tickets_list(self) -> None:
        response = self.client.get(
            "/api/tickets",
            headers={"Authorization": "Bearer token-agent"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIsInstance(payload, list)
        self.assertGreater(len(payload), 0)

    def test_logs_team_list(self) -> None:
        response = self.client.get(
            "/api/logs/team",
            headers={"Authorization": "Bearer token-manager"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIsInstance(payload, list)
        self.assertGreater(len(payload), 0)

    def test_qa_sprints(self) -> None:
        response = self.client.get(
            "/api/qa/sprints",
            headers={"Authorization": "Bearer token-qa-manager"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload), 5)

    def test_qa_defects_filter(self) -> None:
        response = self.client.get(
            "/api/qa/defects?sprints=S510",
            headers={"Authorization": "Bearer token-qa-manager"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload), 18)

    def test_qa_cluster(self) -> None:
        response = self.client.post(
            "/api/qa/analysis/cluster",
            headers={"Authorization": "Bearer token-qa-manager"},
            json={"sprints": ["S510"]},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload.get("input_count"), 18)
        self.assertIn("clusters", payload)

    def test_qa_note_and_status(self) -> None:
        note_response = self.client.post(
            "/api/qa/defects/1/notes",
            headers={"Authorization": "Bearer token-qa-manager"},
            json={"note_body": "Smoke triage note"},
        )
        self.assertEqual(note_response.status_code, 200)
        self.assertTrue(note_response.json().get("success"))

        notes_response = self.client.get(
            "/api/qa/defects/1/notes",
            headers={"Authorization": "Bearer token-qa-manager"},
        )
        self.assertEqual(notes_response.status_code, 200)
        notes_payload = notes_response.json()
        self.assertIsInstance(notes_payload, list)
        self.assertGreaterEqual(len(notes_payload), 1)
        self.assertEqual(notes_payload[0].get("defect_id"), 1)

        status_response = self.client.patch(
            "/api/qa/defects/1/status",
            headers={"Authorization": "Bearer token-qa-manager"},
            json={"status": "resolved", "resolution_reason": "fixed"},
        )
        self.assertEqual(status_response.status_code, 200)
        self.assertTrue(status_response.json().get("success"))
        self.assertEqual(status_response.json().get("defect", {}).get("status"), "resolved")

    def test_qa_export_csv(self) -> None:
        response = self.client.get(
            "/api/qa/reports/export.csv?sprints=S510",
            headers={"Authorization": "Bearer token-qa-manager"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.text.startswith("defect_id,sprint_id,component,severity"))

    def test_qa_assign_rbac_denied_for_engineer(self) -> None:
        response = self.client.patch(
            "/api/qa/defects/1/assign",
            headers={"Authorization": "Bearer token-qa"},
            json={"assignee": "quinn"},
        )
        self.assertEqual(response.status_code, 403)

    def test_qa_duplicate_merged_rbac_denied_for_engineer(self) -> None:
        response = self.client.patch(
            "/api/qa/defects/1/status",
            headers={"Authorization": "Bearer token-qa"},
            json={"status": "duplicate_merged"},
        )
        self.assertEqual(response.status_code, 403)

    def test_qa_engineer_cannot_update_other_assignee_status(self) -> None:
        assign_response = self.client.patch(
            "/api/qa/defects/1/assign",
            headers={"Authorization": "Bearer token-qa-manager"},
            json={"assignee": "taylor"},
        )
        self.assertEqual(assign_response.status_code, 200)

        status_response = self.client.patch(
            "/api/qa/defects/1/status",
            headers={"Authorization": "Bearer token-qa"},
            json={"status": "investigating"},
        )
        self.assertEqual(status_response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
