"""Privacy-tool regressions use isolated, synthetic fixtures, never patient data.

The core tests need only the standard library and mock the optional Excel
reader; one extra round trip runs when that reader is installed. No fixture
result certifies the actual checkout or substitutes for its workbook.
"""
from __future__ import annotations

import contextlib
import datetime
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock
import zipfile

REPO = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("carelink_privacy_verifier", REPO / "v6/tools/verify_no_patient_data.py")
verifier = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(verifier)


class Sheet:
    def __init__(self, rows=()):
        self.rows = rows

    def iter_rows(self, **_kwargs):
        return iter(self.rows)


class Workbook:
    def __init__(self, rows=None):
        self.sheets = {name.strip(): Sheet() for name in [*verifier.AREA_SHEETS, "Waiting List"]}
        self.sheets.update(rows or {})
        self.sheetnames = list(self.sheets)
        self.close = mock.Mock()

    def __getitem__(self, name):
        return self.sheets[name]


class PrivacyVerifierTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="carelink-privacy-test-")
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / "checkout"
        src = self.root / "v6/src"
        src.mkdir(parents=True)
        shutil.copyfile(REPO / "v6/src/inventory_data.js", src / "inventory_data.js")
        (src / "data.js").write_text("const fixture={synthetic:true,phone:'0700300099',email:'fixture@lomamo.example'};\n")
        self.source = self.base / "private-source.xlsx"
        self.source.write_bytes(b"synthetic-reader-fixture-only\n" * 100)
        self.shallow = False
        self.history = ""
        self.env_patch = mock.patch.dict(os.environ, {"CARELINK_PRIVACY_WORKBOOK": ""})
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)
        self.root_patch = mock.patch.object(verifier, "ROOT", self.root)
        self.root_patch.start()
        self.addCleanup(self.root_patch.stop)
        self.git_patch = mock.patch.object(verifier, "git_text", side_effect=self.git_text)
        self.git_patch.start()
        self.addCleanup(self.git_patch.stop)

    def git_text(self, args):
        if args[0] == "ls-tree":
            return "v6/src/inventory_data.js\nv6/src/data.js\n"
        if args[0] == "log":
            return self.history
        if args == ["rev-parse", "--is-shallow-repository"]:
            return "true\n" if self.shallow else "false\n"
        if args == ["ls-files"]:
            return "v6/src/inventory_data.js\nv6/src/data.js\n"
        raise AssertionError(f"Unexpected Git fixture: {args}")

    def fixture_full_report(self, names=None, phones=None):
        with mock.patch.object(verifier, "extract_identities", return_value=(
            {"Unpublished Fixture Identity"} if names is None else names,
            set() if phones is None else phones,
        )):
            return verifier.build_report(self.source)

    def assert_not_cleared(self, report):
        self.assertFalse(report["clean"])
        self.assertFalse(report["full_clearance"])

    def test_missing_source_is_blocked_not_a_detected_finding(self):
        report = verifier.build_report()
        self.assertEqual(report["status"], "blocked")
        self.assertEqual(report["exit_code"], 2)
        self.assertEqual(report["failed_checks"], 0)
        self.assertGreater(report["blocked_checks"], 0)
        self.assertTrue(report["repository_checks_passed"])
        self.assertEqual(report["identity_sweep"]["status"], "blocked")
        self.assertFalse(report["complete"])
        self.assert_not_cleared(report)
        self.assertTrue(all(c["ok"] is None for c in report["checks"] if c["status"] == "blocked"))

    def test_repository_only_is_explicitly_limited_and_never_full_clearance(self):
        with mock.patch.object(verifier, "extract_identities", side_effect=AssertionError("must not read a workbook")):
            report = verifier.build_report(repository_only=True)
        self.assertEqual(report["scope"], "repository")
        self.assertEqual(report["status"], "passed")
        self.assertEqual(report["exit_code"], 0)
        self.assertEqual(report["identity_sweep"]["status"], "not_run")
        self.assertFalse(report["complete"])
        self.assert_not_cleared(report)
        self.assertEqual(sum(c["status"] == "skipped" for c in report["checks"]), 3)

    def test_empty_patterns_never_match_unrelated_text(self):
        name_rx, phone_rx = verifier.identity_patterns(set(), set())
        for rx in (name_rx, phone_rx):
            self.assertEqual(rx.findall("Ordinary text and 42 records."), [])

    def test_names_only_corpus_can_finish_without_false_phone_matches(self):
        report = self.fixture_full_report(names={"Unpublished Fixture Identity"}, phones=set())
        self.assertTrue(report["clean"], report)
        self.assertTrue(report["complete"])
        self.assertEqual(report["identity_sweep"]["status"], "passed")
        self.assertEqual(report["exit_code"], 0)

    def test_phones_only_corpus_can_finish_without_false_name_matches(self):
        report = self.fixture_full_report(names=set(), phones={"700100042"})
        self.assertTrue(report["clean"], report)
        self.assertEqual(report["identities"], {"names": 0, "phones": 1})

    def test_empty_corpus_cannot_grant_clearance(self):
        report = self.fixture_full_report(names=set(), phones=set())
        self.assertEqual(report["status"], "blocked")
        self.assertEqual(report["exit_code"], 2)
        self.assert_not_cleared(report)

    def test_all_excluded_roster_names_cannot_grant_clearance(self):
        with mock.patch.object(verifier, "staff_names", return_value={"unpublished fixture identity"}):
            report = self.fixture_full_report()
        self.assertEqual(report["status"], "blocked")
        self.assert_not_cleared(report)

    def test_known_name_match_fails_without_echoing_private_values(self):
        name = "Unpublished Fixture Identity"
        (self.root / "fixture.txt").write_text(name)
        report = self.fixture_full_report(names={name})
        self.assertEqual(report["status"], "failed")
        self.assertEqual(report["identity_sweep"]["status"], "failed")
        self.assertEqual(report["exit_code"], 1)
        self.assert_not_cleared(report)
        self.assertNotIn(name, json.dumps(report))

    def test_formatted_phone_and_whitespace_name_match(self):
        name_rx, phone_rx = verifier.identity_patterns({"Privacy Fixture Person"}, {"700100042"})
        self.assertEqual(len(name_rx.findall("PRIVACY  Fixture\nPerson")), 1)
        for value in ["0700100042", "+254 700 100 042", "700100042", "(0700) 100-042"]:
            self.assertEqual(len(phone_rx.findall(value)), 1, value)
        self.assertEqual(phone_rx.findall("17001000429"), [])

    def test_numeric_excel_and_international_phones_normalise(self):
        expected = "700100042"
        for value in [700100042, 700100042.0, "0700100042", "+254 (700) 100-042"]:
            self.assertEqual(verifier.normalise_phone(value), expected)
        for value in [None, "not a number", 42]:
            self.assertEqual(verifier.normalise_phone(value), "")

    def test_known_identity_inside_zip_fails(self):
        with zipfile.ZipFile(self.root / "fixture.zip", "w") as archive:
            archive.writestr("fixture.txt", "Unpublished Fixture Identity")
        report = self.fixture_full_report()
        self.assertEqual(report["status"], "failed")
        self.assertTrue(any(c["status"] == "failed" and "archive" in c["check"] for c in report["checks"]))
        self.assert_not_cleared(report)

    def test_known_secret_inside_zip_fails_in_repository_only_scope(self):
        marker = "3" + "5" * 14
        with zipfile.ZipFile(self.root / "fixture.zip", "w") as archive:
            archive.writestr("fixture.txt", marker)
        report = verifier.build_report(repository_only=True)
        self.assertEqual(report["status"], "failed")
        self.assertEqual(report["exit_code"], 1)
        self.assertNotIn(marker, json.dumps(report))
        self.assert_not_cleared(report)

    def test_unreadable_archive_is_blocked_not_silently_skipped(self):
        (self.root / "fixture.zip").write_bytes(b"synthetic invalid archive")
        report = self.fixture_full_report()
        self.assertEqual(report["status"], "blocked")
        self.assertEqual(report["exit_code"], 2)
        self.assertEqual(report["identity_sweep"]["status"], "blocked")
        self.assertEqual(report["failed_checks"], 0)
        self.assertTrue(report["secret_scan_errors"])
        self.assert_not_cleared(report)

    def test_unreadable_archive_member_is_blocked_without_echoing_exception(self):
        with zipfile.ZipFile(self.root / "fixture.zip", "w") as archive:
            archive.writestr("fixture.txt", "synthetic fixture")
        private_error = "never echo a private cell or member value"
        with mock.patch.object(zipfile.ZipFile, "read", side_effect=RuntimeError(private_error)):
            report = self.fixture_full_report()
        self.assertEqual(report["status"], "blocked")
        self.assertEqual(report["exit_code"], 2)
        self.assertNotIn(private_error, json.dumps(report))
        self.assert_not_cleared(report)

    def test_archive_read_error_does_not_hide_a_positive_identity_match(self):
        with zipfile.ZipFile(self.root / "fixture.zip", "w") as archive:
            archive.writestr("fixture.txt", "synthetic fixture")
        with mock.patch.object(verifier, "scan_zip", return_value={
            "names": 1, "phones": 0, "inner_xlsx": [], "error": "unreadable member",
        }):
            report = self.fixture_full_report()
        self.assertEqual(report["identity_sweep"]["status"], "failed")
        self.assertEqual(report["exit_code"], 1)
        self.assertGreater(report["blocked_checks"], 0)
        self.assertFalse(report["complete"])
        self.assert_not_cleared(report)

    def test_binary_members_are_outside_text_coverage_but_nested_workbooks_fail(self):
        marker = "3" + "5" * 14
        path = self.root / "fixture.zip"
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr("fixture.PDF", "Unpublished Fixture Identity " + marker)
        # This is an explicit coverage limitation, not evidence that PDFs have
        # been inspected. Binary content must not be mislabelled as text.
        report = self.fixture_full_report()
        self.assertTrue(report["clean"], report)
        self.assertIn("not a PDF", report["coverage"]["binary_documents"])
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr("fixture.xlsx", b"synthetic workbook marker")
        report = self.fixture_full_report()
        self.assertEqual(report["status"], "failed")
        self.assert_not_cleared(report)

    def test_unreadable_text_input_cannot_be_reported_as_a_pass(self):
        path = self.root / "fixture.txt"
        path.write_text("synthetic fixture")
        read_bytes = Path.read_bytes

        def reader(file):
            if file == path:
                raise PermissionError("do not log private file data")
            return read_bytes(file)

        with mock.patch.object(Path, "read_bytes", autospec=True, side_effect=reader):
            report = self.fixture_full_report()
        self.assertEqual(report["status"], "blocked")
        self.assertEqual(report["exit_code"], 2)
        self.assertTrue(report["secret_scan_errors"])
        self.assert_not_cleared(report)

    def test_required_register_or_contact_read_failure_is_blocked(self):
        for function in ("inventory_structure", "contact_conventions"):
            with self.subTest(function=function), mock.patch.object(verifier, function, side_effect=PermissionError("private input")):
                report = verifier.build_report(repository_only=True)
            self.assertEqual(report["status"], "blocked")
            self.assertEqual(report["exit_code"], 2)
            self.assertNotIn("private input", json.dumps(report))
            self.assert_not_cleared(report)

    def test_inventory_failure_diagnostics_do_not_republish_identifier_values(self):
        path = self.root / "v6/src/inventory_data.js"
        text = path.read_text()
        private_marker = "SyntheticPrivateDeviceValue"
        text, changed = re.subn(r'serial:"[^"]*"', 'serial:"' + private_marker + '"', text, count=1)
        self.assertEqual(changed, 1)
        path.write_text(text)
        report = verifier.build_report(repository_only=True)
        self.assertEqual(report["status"], "failed")
        self.assertNotIn(private_marker, json.dumps(report))
        self.assert_not_cleared(report)

    def test_secret_finding_is_not_hidden_by_a_missing_workbook(self):
        # Invent a pattern-shaped value only in a private temporary fixture.
        marker = "3" + "5" * 14
        (self.root / "fixture.txt").write_text(marker)
        report = verifier.build_report()
        self.assertEqual(report["status"], "failed")
        self.assertEqual(report["exit_code"], 1)
        self.assertGreater(report["blocked_checks"], 0)
        self.assertNotIn(marker, json.dumps(report), "secret match values must not be printed into reports")
        self.assert_not_cleared(report)

    def test_missing_explicit_path_is_described_accurately(self):
        report = verifier.build_report(self.base / "absent.xlsx")
        self.assertEqual(report["status"], "blocked")
        self.assertIn("supplied workbook path", report["identity_sweep"]["reason"])
        self.assert_not_cleared(report)

    def test_source_inside_checkout_is_refused(self):
        path = self.root / "private.xlsx"
        path.write_bytes(self.source.read_bytes())
        report = verifier.build_report(path)
        self.assertEqual(report["status"], "blocked")
        self.assertIn("outside the public checkout", report["identity_sweep"]["reason"])
        self.assertTrue(path.exists(), "never silently delete caller-owned input")

    def test_shallow_history_is_blocked_even_with_valid_identity_comparison(self):
        self.shallow = True
        report = self.fixture_full_report()
        self.assertEqual(report["identity_sweep"]["status"], "passed")
        self.assertFalse(report["repository_checks_passed"])
        self.assertEqual(report["status"], "blocked")
        self.assertEqual(report["exit_code"], 2)
        self.assert_not_cleared(report)

    def test_one_commit_is_not_incorrectly_assumed_to_be_shallow(self):
        self.shallow = False
        report = self.fixture_full_report()
        self.assertTrue(report["clean"])
        self.assertFalse(any(c["status"] == "blocked" for c in report["checks"]))

    def test_workbook_history_policy_fails_even_when_identity_comparison_passes(self):
        self.history = "synthetic historical workbook commit\n"
        report = self.fixture_full_report()
        self.assertEqual(report["identity_sweep"]["status"], "passed")
        self.assertEqual(report["status"], "failed")
        self.assertEqual(report["exit_code"], 1)
        self.assertFalse(report["repository_checks_passed"])
        self.assert_not_cleared(report)

    def test_untracked_master_in_checkout_still_fails_the_repository_guard(self):
        (self.root / verifier.WORKBOOK_NAME).write_bytes(self.source.read_bytes())
        report = self.fixture_full_report()
        self.assertEqual(report["status"], "failed")
        self.assertEqual(report["exit_code"], 1)
        self.assert_not_cleared(report)

    def test_git_failure_cannot_be_reported_as_clear_history(self):
        with mock.patch.object(verifier, "git_text", side_effect=verifier.VerificationBlocked("Git unavailable")):
            report = verifier.build_report(repository_only=True)
        self.assertEqual(report["status"], "blocked")
        self.assertEqual(report["exit_code"], 2)
        self.assert_not_cleared(report)

    def test_binary_history_recovery_skips_deletion_and_preserves_bytes(self):
        data = b"PK\x03\x04\xff\x80\x00synthetic-binary-fixture"
        answers = [subprocess.CompletedProcess([], 128, stdout=b"", stderr=b"deleted"),
                   subprocess.CompletedProcess([], 0, stdout=data, stderr=b"")]
        with mock.patch.object(verifier, "git_text", return_value="deleted\noriginal\n"), \
             mock.patch.object(verifier.subprocess, "run", side_effect=answers) as runner:
            path = verifier.workbook_from_history()
        self.addCleanup(path.unlink, missing_ok=True)
        self.assertEqual(path.read_bytes(), data)
        self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        self.assertNotIn(self.root, path.resolve().parents)
        self.assertEqual(runner.call_count, 2)
        for call in runner.call_args_list:
            self.assertFalse(call.kwargs.get("text", False), "XLSX blobs must not be UTF-8 decoded")
            self.assertEqual(call.args[0][:3], ["git", "cat-file", "blob"])

    def test_staging_is_unique_and_never_overwrites_an_existing_path(self):
        first = verifier.private_workbook(b"first synthetic workbook")
        second = verifier.private_workbook(b"second synthetic workbook")
        self.addCleanup(first.unlink, missing_ok=True)
        self.addCleanup(second.unlink, missing_ok=True)
        self.assertNotEqual(first, second)
        self.assertEqual(first.read_bytes(), b"first synthetic workbook")
        self.assertEqual(second.read_bytes(), b"second synthetic workbook")

    def test_owned_staging_copy_is_removed_on_success_and_reader_failure(self):
        original = self.source.read_bytes()
        for fail in (False, True):
            staged = []
            create = verifier.private_workbook

            def stage(data):
                path = create(data)
                staged.append(path)
                return path

            result = ({"Unpublished Fixture Identity"}, set())
            with mock.patch.object(verifier, "private_workbook", side_effect=stage), \
                 mock.patch.object(verifier, "extract_identities", side_effect=verifier.VerificationBlocked("Reader unavailable") if fail else None,
                                   return_value=result):
                report = verifier.build_report(self.source)
            self.assertEqual(len(staged), 1)
            self.assertFalse(staged[0].exists())
            self.assertEqual(self.source.read_bytes(), original, "caller retains control of its original")
            self.assertEqual(report["status"], "blocked" if fail else "passed")

    def test_reader_extracts_only_synthetic_fixture_values_and_closes_workbook(self):
        row = ["Privaté Fixture Person", None, None, None, None, None, None, None, datetime.date(2026, 1, 1)]
        book = Workbook({"Manyatta": Sheet([row]), "Waiting List": Sheet([
            ["Synthetic Waiting Person", "+254 (700) 100-042"],
            [None, 700100043.0],
        ])})
        module = SimpleNamespace(load_workbook=mock.Mock(return_value=book))
        with mock.patch.dict(sys.modules, {"openpyxl": module}):
            names, phones = verifier.extract_identities(self.source)
        self.assertEqual(names, {"Privaté Fixture Person", "Synthetic Waiting Person"})
        self.assertEqual(phones, {"700100042", "700100043"})
        book.close.assert_called_once()

    def test_blank_demo_template_is_not_accepted_as_comparison_evidence(self):
        book = Workbook()
        book.sheetnames = ["Instructions", "Patient Register"]
        with mock.patch.dict(sys.modules, {"openpyxl": SimpleNamespace(load_workbook=lambda *_a, **_k: book)}):
            with self.assertRaisesRegex(verifier.VerificationBlocked, "blank/demo template"):
                verifier.extract_identities(self.source)
        book.close.assert_called_once()

    def test_empty_master_schema_is_still_blocked_and_closed(self):
        book = Workbook()
        with mock.patch.dict(sys.modules, {"openpyxl": SimpleNamespace(load_workbook=lambda *_a, **_k: book)}):
            with self.assertRaisesRegex(verifier.VerificationBlocked, "empty corpus"):
                verifier.extract_identities(self.source)
        book.close.assert_called_once()

    def test_missing_reader_is_blocked_without_stdout_diagnostics(self):
        output = io.StringIO()
        with mock.patch.dict(sys.modules, {"openpyxl": None}), contextlib.redirect_stdout(output):
            with self.assertRaisesRegex(verifier.VerificationBlocked, "reader unavailable"):
                verifier.extract_identities(self.source)
        self.assertEqual(output.getvalue(), "")

    def test_invalid_workbook_reader_error_does_not_expose_exception_content(self):
        private_message = "do not log source cell content"
        module = SimpleNamespace(load_workbook=mock.Mock(side_effect=ValueError(private_message)))
        with mock.patch.dict(sys.modules, {"openpyxl": module}):
            with self.assertRaises(verifier.VerificationBlocked) as error:
                verifier.extract_identities(self.source)
        self.assertNotIn(private_message, str(error.exception))

    def test_json_cli_stays_parseable_when_reader_is_missing(self):
        output = io.StringIO()
        with mock.patch.dict(sys.modules, {"openpyxl": None}), contextlib.redirect_stdout(output):
            code = verifier.main(["--workbook", str(self.source), "--json"])
        report = json.loads(output.getvalue())
        self.assertEqual(code, 2)
        self.assertEqual(report["status"], "blocked")
        self.assert_not_cleared(report)

    def test_text_cli_distinguishes_missing_evidence_and_real_findings(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            code = verifier.main([])
        self.assertEqual(code, 2)
        self.assertIn("BLOCKED", output.getvalue())
        self.assertNotIn("NOT CLEAN", output.getvalue())
        (self.root / "fixture.txt").write_text("3" + "5" * 14)
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            code = verifier.main([])
        self.assertEqual(code, 1)
        self.assertIn("NOT CLEAN", output.getvalue())

    @unittest.skipUnless(importlib.util.find_spec("openpyxl"), "optional Excel reader not installed; install requirements-privacy.txt for the real synthetic-XLSX round trip")
    def test_real_synthetic_xlsx_reader_and_comparison_round_trip(self):
        import openpyxl
        book = openpyxl.Workbook()
        book.remove(book.active)
        for name in verifier.AREA_SHEETS:
            book.create_sheet(name)
        waiting = book.create_sheet("Waiting List")
        book[verifier.AREA_SHEETS[0]]["A4"] = "Unpublished Fixture Identity"
        book[verifier.AREA_SHEETS[0]]["I4"] = datetime.date(2026, 1, 1)
        waiting["A3"] = "Synthetic Waiting Identity"
        waiting["B3"] = "+254 700 100 042"
        book.save(self.source)
        book.close()
        report = verifier.build_report(self.source)
        self.assertTrue(report["clean"], report)
        self.assertEqual(report["identities"], {"names": 2, "phones": 1})
        (self.root / "fixture.txt").write_text("Unpublished Fixture Identity")
        report = verifier.build_report(self.source)
        self.assertEqual(report["status"], "failed")
        self.assert_not_cleared(report)
        # A real blank/demo-format file must not serve as comparison evidence.
        template = openpyxl.Workbook()
        template.active.title = "Patient Register"
        template.save(self.source)
        template.close()
        report = verifier.build_report(self.source)
        self.assertEqual(report["identity_sweep"]["status"], "blocked")
        self.assert_not_cleared(report)

    def test_cli_can_use_an_explicit_private_environment_path(self):
        output = io.StringIO()
        with mock.patch.dict(os.environ, {"CARELINK_PRIVACY_WORKBOOK": str(self.source)}), \
             mock.patch.object(verifier, "extract_identities", return_value=({"Unpublished Fixture Identity"}, set())), \
             contextlib.redirect_stdout(output):
            code = verifier.main(["--json"])
        self.assertEqual(code, 0)
        self.assertTrue(json.loads(output.getvalue())["full_clearance"])

    def test_repository_only_never_reads_an_environment_source(self):
        output = io.StringIO()
        with mock.patch.dict(os.environ, {"CARELINK_PRIVACY_WORKBOOK": str(self.source)}), \
             mock.patch.object(verifier, "extract_identities", side_effect=AssertionError("must not read private input")), \
             contextlib.redirect_stdout(output):
            code = verifier.main(["--repository-only", "--json"])
        self.assertEqual(code, 0)
        report = json.loads(output.getvalue())
        self.assertEqual(report["identity_sweep"]["status"], "not_run")
        self.assert_not_cleared(report)

    def test_repository_only_cannot_silently_ignore_a_workbook_argument(self):
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as error:
                verifier.main(["--repository-only", "--workbook", str(self.source)])
        self.assertEqual(error.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
