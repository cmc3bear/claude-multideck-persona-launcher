#!/usr/bin/env python3
"""Unit tests for reviewer-review.py — MULTI-REV-0022 criterion C9.

Covers every OQE 2.0 check path (C1–C7), the retained sanitization checks,
and mixed pass/fail scenarios at the report level.

Run from the scripts/ directory:

    python -m unittest test_reviewer_review -v
"""
from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


def _load_module():
    # reviewer-review.py has a hyphen in its filename, so import by path.
    src = Path(__file__).with_name("reviewer-review.py")
    spec = importlib.util.spec_from_file_location("reviewer_review", src)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    # Register before exec_module so @dataclass can resolve cls.__module__.
    sys.modules["reviewer_review"] = module
    spec.loader.exec_module(module)
    return module


rr = _load_module()


_TEST_ARTIFACTS = tempfile.TemporaryDirectory()


def _make_artifact(name: str = "output.md", body: str = "clean output\n") -> str:
    path = Path(_TEST_ARTIFACTS.name) / name
    path.write_text(body, encoding="utf-8")
    return str(path)


def _valid_job(**overrides) -> dict:
    """Build a fully OQE 2.0 compliant job that PASSes every check."""
    job = {
        "id": "MULTI-REV-0022",
        "oqe_version": "2.0",
        "subject": "Upgrade reviewer-review.py",
        "problem": "Review gate lacks OQE 2.0 enforcement.",
        "status": "submitted",
        "depends_on": [],
        "criteria": [
            "criterion 1 — per §11",
            "criterion 2 — per §12",
            "criterion 3 — per §13",
            "criterion 4 — per §14",
            "criterion 5 — per §4",
        ],
        "evidence_log": [
            {"criterion_index": 1, "strength": "STRONG", "observation": "a"},
            {"criterion_index": 2, "strength": "STRONG", "observation": "b"},
            {"criterion_index": 3, "strength": "MODERATE", "observation": "c"},
            {"criterion_index": 4, "strength": "LIMITED", "observation": "d"},
            {"criterion_index": 5, "strength": "STRONG", "observation": "e"},
        ],
        "output_path": _make_artifact(),
    }
    job.update(overrides)
    return job


class C1_ProblemField(unittest.TestCase):
    def test_present(self):
        r = rr.check_problem_field(_valid_job())
        self.assertTrue(r.passed)
        self.assertEqual(r.capability, "§11 problem_statement_enforced")

    def test_missing(self):
        job = _valid_job()
        del job["problem"]
        r = rr.check_problem_field(job)
        self.assertFalse(r.passed)
        self.assertIn("problem", r.detail)

    def test_empty_string(self):
        r = rr.check_problem_field(_valid_job(problem="   "))
        self.assertFalse(r.passed)


class C2_CriteriaCount(unittest.TestCase):
    def test_exactly_five(self):
        r = rr.check_criteria_count(_valid_job())
        self.assertTrue(r.passed)

    def test_four_fails(self):
        job = _valid_job()
        job["criteria"] = job["criteria"][:4]
        r = rr.check_criteria_count(job)
        self.assertFalse(r.passed)
        self.assertIn("4", r.detail)

    def test_missing_fails(self):
        job = _valid_job()
        del job["criteria"]
        r = rr.check_criteria_count(job)
        self.assertFalse(r.passed)

    def test_non_list(self):
        r = rr.check_criteria_count(_valid_job(criteria="not a list"))
        self.assertFalse(r.passed)


class C3_CriteriaCitations(unittest.TestCase):
    def test_all_cite_section(self):
        r = rr.check_criteria_citations(_valid_job())
        self.assertTrue(r.passed)

    def test_one_missing(self):
        job = _valid_job()
        job["criteria"][2] = "criterion 3 — no anchor here"
        r = rr.check_criteria_citations(job)
        self.assertFalse(r.passed)
        self.assertIn("#3", r.detail)

    def test_all_missing(self):
        job = _valid_job(criteria=["a", "b", "c", "d", "e"])
        r = rr.check_criteria_citations(job)
        self.assertFalse(r.passed)

    def test_empty_criteria(self):
        r = rr.check_criteria_citations(_valid_job(criteria=[]))
        self.assertFalse(r.passed)

    def test_citation_with_whitespace(self):
        job = _valid_job(criteria=["criterion — per § 11"] * 5)
        self.assertTrue(rr.check_criteria_citations(job).passed)


class C4_OqeVersion(unittest.TestCase):
    def test_present(self):
        self.assertTrue(rr.check_oqe_version(_valid_job()).passed)

    def test_missing(self):
        job = _valid_job()
        del job["oqe_version"]
        self.assertFalse(rr.check_oqe_version(job).passed)

    def test_empty(self):
        self.assertFalse(rr.check_oqe_version(_valid_job(oqe_version="")).passed)


class C5_EvidenceCriterionMatch(unittest.TestCase):
    def test_fully_covered(self):
        r = rr.check_evidence_criterion_match(_valid_job())
        self.assertTrue(r.passed)

    def test_missing_criterion_3(self):
        job = _valid_job()
        job["evidence_log"] = [
            e for e in job["evidence_log"] if e["criterion_index"] != 3
        ]
        r = rr.check_evidence_criterion_match(job)
        self.assertFalse(r.passed)
        self.assertIn("#3", r.detail)

    def test_untagged_strength(self):
        job = _valid_job()
        job["evidence_log"][0]["strength"] = "meh"
        r = rr.check_evidence_criterion_match(job)
        self.assertFalse(r.passed)
        self.assertIn("STRONG/MODERATE/LIMITED", r.detail)

    def test_no_evidence_log(self):
        job = _valid_job()
        del job["evidence_log"]
        r = rr.check_evidence_criterion_match(job)
        self.assertFalse(r.passed)

    def test_empty_criteria_still_fails(self):
        r = rr.check_evidence_criterion_match(_valid_job(criteria=[]))
        self.assertFalse(r.passed)


class C6_IdFormat(unittest.TestCase):
    def test_valid_id(self):
        self.assertTrue(rr.check_id_format(_valid_job(id="MULTI-REV-0022")).passed)

    def test_legacy_id_accepted(self):
        r = rr.check_id_format(_valid_job(id="WS-0057", legacy_id="WS-0057"))
        self.assertTrue(r.passed)
        self.assertIn("LEGACY", r.detail)

    def test_freeform_rejected(self):
        r = rr.check_id_format(_valid_job(id="fix-the-thing"))
        self.assertFalse(r.passed)

    def test_short_sequence_rejected(self):
        r = rr.check_id_format(_valid_job(id="MULTI-FIX-42"))
        self.assertFalse(r.passed)


class C7_DependsOnExplicit(unittest.TestCase):
    def test_empty_list_ok(self):
        self.assertTrue(rr.check_depends_on_explicit(_valid_job(depends_on=[])).passed)

    def test_populated_list_ok(self):
        self.assertTrue(
            rr.check_depends_on_explicit(_valid_job(depends_on=["MULTI-DOCS-0021"])).passed
        )

    def test_null_rejected(self):
        self.assertFalse(rr.check_depends_on_explicit(_valid_job(depends_on=None)).passed)

    def test_missing_rejected(self):
        job = _valid_job()
        del job["depends_on"]
        self.assertFalse(rr.check_depends_on_explicit(job).passed)


class RetainedSanitizationChecks(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "artifact.md"

    def test_artifact_exists_ok(self):
        self.path.write_text("# hello world", encoding="utf-8")
        self.assertTrue(rr.check_artifact_exists(str(self.path)).passed)

    def test_artifact_missing(self):
        self.assertFalse(rr.check_artifact_exists(str(self.path)).passed)

    def test_artifact_empty(self):
        self.path.write_text("", encoding="utf-8")
        self.assertFalse(rr.check_artifact_exists(str(self.path)).passed)

    def test_no_output_path(self):
        self.assertFalse(rr.check_artifact_exists(None).passed)

    def test_cary_marker_detected(self):
        self.path.write_text("Tailscale 100.79.177.54 routes to home", encoding="utf-8")
        self.assertFalse(rr.check_no_cary_refs(str(self.path)).passed)

    def test_cary_clean(self):
        self.path.write_text("just a sanitized doc", encoding="utf-8")
        self.assertTrue(rr.check_no_cary_refs(str(self.path)).passed)

    def test_scaffold_detected(self):
        self.path.write_text("// SCAFFOLD fill this in", encoding="utf-8")
        self.assertFalse(rr.check_no_scaffold_markers(str(self.path)).passed)

    def test_scaffold_clean(self):
        self.path.write_text("final copy", encoding="utf-8")
        self.assertTrue(rr.check_no_scaffold_markers(str(self.path)).passed)

    def test_python_syntax_ok(self):
        py = self.path.with_suffix(".py")
        py.write_text("x = 1\n", encoding="utf-8")
        self.assertTrue(rr.check_python_syntax(str(py)).passed)

    def test_python_syntax_error(self):
        py = self.path.with_suffix(".py")
        py.write_text("def (\n", encoding="utf-8")
        self.assertFalse(rr.check_python_syntax(str(py)).passed)

    def test_python_syntax_not_applicable(self):
        self.assertIsNone(rr.check_python_syntax(str(self.path)))


class RunReviewMixedScenarios(unittest.TestCase):
    def test_all_pass(self):
        report = rr.run_review(_valid_job())
        self.assertEqual(report.verdict, "PASS")

    def test_partial_failure_flags(self):
        job = _valid_job()
        del job["problem"]
        job["criteria"] = job["criteria"][:3]
        report = rr.run_review(job)
        self.assertEqual(report.verdict, "FLAG")
        names = {r.name for r in report.failures()}
        self.assertIn("problem_field_present", names)
        self.assertIn("minimum_5_criteria", names)

    def test_capabilities_surface_on_failure(self):
        report = rr.run_review(_valid_job(oqe_version=""))
        fail = [r for r in report.failures() if r.name == "oqe_version_declared"][0]
        self.assertEqual(fail.capability, "§12 oqe_version_declaration")

    def test_table_output_lists_every_check(self):
        job = _valid_job()
        job["criteria"] = job["criteria"][:4]
        report = rr.run_review(job)
        table = rr.format_table(report)
        self.assertIn("FAIL", table)
        self.assertIn("minimum_5_criteria", table)
        self.assertIn("problem_field_present", table)
        self.assertIn("VERDICT: FLAG", table)

    def test_json_output_shape(self):
        report = rr.run_review(_valid_job())
        data = report.to_dict()
        self.assertEqual(data["verdict"], "PASS")
        self.assertEqual(len(data["results"]), len(rr.OQE_CHECKS) + 3)
        for row in data["results"]:
            self.assertIn("capability", row)
            self.assertIn("passed", row)


class CliEndToEnd(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.board = Path(self.tmp.name) / "job-board.json"

    def _write_board(self, job: dict):
        self.board.write_text(
            json.dumps({"meta": {"version": 1}, "jobs": [job]}),
            encoding="utf-8",
        )

    def test_cli_returns_0_on_pass(self):
        self._write_board(_valid_job())
        code = rr.main([_valid_job()["id"], "--board", str(self.board), "--json"])
        self.assertEqual(code, 0)

    def test_cli_returns_1_on_flag(self):
        job = _valid_job()
        del job["problem"]
        self._write_board(job)
        code = rr.main([job["id"], "--board", str(self.board), "--json"])
        self.assertEqual(code, 1)

    def test_cli_unknown_job(self):
        self._write_board(_valid_job())
        code = rr.main(["DOES-NOT-EXIST-0001", "--board", str(self.board)])
        self.assertEqual(code, 1)


if __name__ == "__main__":
    unittest.main()
