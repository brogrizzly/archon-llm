from __future__ import annotations

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
AGENTS_PATH = ROOT / "AGENTS.md"


class GovernanceDocumentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.document = AGENTS_PATH.read_text(encoding="utf-8")
        cls.normalized = " ".join(cls.document.casefold().split())

    def test_all_ten_governance_areas_remain_documented(self) -> None:
        headings = (
            "Governance and scope classification",
            "Continuous risk management",
            "Data governance and privacy",
            "Technical documentation and architecture",
            "Audit logging and traceability",
            "Transparency and machine identification",
            "Human oversight and interruption",
            "Accuracy, robustness, and adversarial defense",
            "Post-market monitoring and incident response",
            "Conformity assessment and versioned attestation",
        )
        for heading in headings:
            with self.subTest(heading=heading):
                self.assertIn(heading.casefold(), self.normalized)

    def test_document_keeps_legal_and_privacy_limits_explicit(self) -> None:
        required_statements = (
            "not legal advice",
            "not a conformity assessment",
            "not been assessed",
            "do not log prompts or raw model output",
            "do not collect hidden reasoning traces",
            "article 73",
            "not adopted as a legal deadline",
            "status: not signed",
        )
        for statement in required_statements:
            with self.subTest(statement=statement):
                self.assertIn(statement, self.normalized)


if __name__ == "__main__":
    unittest.main()
