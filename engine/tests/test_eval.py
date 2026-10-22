"""Evaluation harness: label conversion and scoring round-trip."""

from __future__ import annotations

import pytest

from eval.labels import to_harte, write_lab
from eval.run import score, weighted


@pytest.mark.parametrize(
    ("app", "harte"),
    [
        ("C", "C:maj"),
        ("Am", "A:min"),
        ("F#m7b5", "F#:hdim7"),
        ("Bbmaj7", "Bb:maj7"),
        ("G7", "G:7"),
        ("D6", "D:maj6"),
        ("EmMaj7", "E:minmaj7"),
        ("Asus4", "A:sus4"),
        ("N", "N"),
    ],
)
def test_to_harte(app, harte):
    assert to_harte(app) == harte


def test_to_harte_rejects_unknown_quality():
    with pytest.raises(ValueError):
        to_harte("C13")


def test_identical_labs_score_perfectly(tmp_path):
    segs = [
        {"start": 0.0, "end": 2.0, "label": "C"},
        {"start": 2.0, "end": 4.0, "label": "Am"},
        {"start": 4.0, "end": 6.0, "label": "G7"},
    ]
    ref, est = tmp_path / "ref.lab", tmp_path / "est.lab"
    write_lab(ref, segs)
    write_lab(est, segs)
    s = score(ref, est)
    assert s["majmin"] == pytest.approx(1.0)
    assert s["sevenths"] == pytest.approx(1.0)


def test_major_minor_swap_scores_root_but_not_majmin(tmp_path):
    ref, est = tmp_path / "ref.lab", tmp_path / "est.lab"
    write_lab(ref, [{"start": 0.0, "end": 4.0, "label": "A"}])
    write_lab(est, [{"start": 0.0, "end": 4.0, "label": "Am"}])
    s = score(ref, est)
    assert s["root"] == pytest.approx(1.0)
    assert s["majmin"] == pytest.approx(0.0)


def test_weighted_is_duration_weighted():
    rows = [{"duration": 30.0, "majmin": 1.0}, {"duration": 10.0, "majmin": 0.0}]
    assert weighted(rows, "majmin") == pytest.approx(0.75)
