"""Corpus preset registry tests (pure: no network, DB, or model)."""

from __future__ import annotations

import pytest

from app.ingestion.presets import PRESETS, Preset, get_preset, list_presets


def test_get_preset_returns_known():
    p = get_preset("fred-core")
    assert isinstance(p, Preset)
    assert p.dataset == "fredk8/fred_core_document_corpus_v1"


def test_get_preset_unknown_raises_with_available_names():
    with pytest.raises(KeyError) as exc:
        get_preset("does-not-exist")
    assert "fred-core" in str(exc.value)


def test_list_presets_non_empty():
    assert len(list_presets()) >= 2


@pytest.mark.parametrize("preset", PRESETS.values(), ids=lambda p: p.name)
def test_preset_is_well_formed(preset: Preset):
    assert preset.kind in {"text", "pdf"}
    assert preset.roles, "a preset must grant at least one role"
    assert preset.sensitivity in {"public", "internal", "restricted"}
    if preset.kind == "pdf":
        assert preset.pdf_column
    else:
        assert preset.text_column


def test_patient_doctor_is_line_delimited():
    # The grouping prefix is what saves this set from useless per-line chunks.
    assert get_preset("patient-doctor").record_prefix
