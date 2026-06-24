"""HuggingFace ingester tests: row selection and grouping are pure (no net/DB)."""

from __future__ import annotations

from app.ingestion.hf_dataset import _slug, group_records, select_texts

PRE = "This is a conversation between a patient and a doctor"


def _rows(*values: object) -> list[dict[str, object]]:
    return [{"text": v} for v in values]


def test_select_texts_drops_blank_and_strips():
    rows = _rows("a", "   ", "", "  b  ")
    assert list(select_texts(rows, text_column="text")) == ["a", "b"]


def test_select_texts_skips_non_string_values():
    rows = _rows("a", 42, None, "b")
    assert list(select_texts(rows, text_column="text")) == ["a", "b"]


def test_select_texts_missing_column_yields_nothing():
    assert list(select_texts([{"other": "x"}], text_column="text")) == []


def test_group_records_no_prefix_is_one_per_line():
    assert list(group_records(["a", "b", "c"], record_prefix=None)) == ["a", "b", "c"]


def test_group_records_groups_by_prefix():
    lines = [PRE, "symptoms", "chest pain", PRE, "other case", "cough"]
    out = list(group_records(lines, record_prefix=PRE))
    assert out == [f"{PRE}\nsymptoms\nchest pain", f"{PRE}\nother case\ncough"]


def test_group_records_handles_leading_non_prefix_lines():
    # Lines before the first prefix still form a record rather than vanishing.
    lines = ["stray", PRE, "case one"]
    out = list(group_records(lines, record_prefix=PRE))
    assert out == ["stray", f"{PRE}\ncase one"]


def test_group_records_single_record():
    lines = [PRE, "only case", "line two"]
    assert list(group_records(lines, record_prefix=PRE)) == [f"{PRE}\nonly case\nline two"]


def test_slug_strips_org_prefix():
    assert _slug("Postzeun/Patient-Doctor") == "patient-doctor"
    assert _slug("plain") == "plain"
