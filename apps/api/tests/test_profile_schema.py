import pytest

from app.schemas.profile import Profile


def test_empty_profile_is_valid():
    p = Profile()
    assert p.stressors == []
    assert p.coping_strategies == []
    assert p.support_system == []
    assert p.sleep_patterns is None
    assert p.goals == []
    assert p.notable_events == []


def test_profile_round_trip_through_jsonable():
    raw = {
        "stressors": [{"label": "work", "intensity": 3}],
        "coping_strategies": [{"label": "walks", "effective": True}],
        "support_system": ["partner"],
        "sleep_patterns": {"typical_hours": 6.5, "issues": ["insomnia"]},
        "goals": [{"label": "less screens"}],
        "notable_events": [{"label": "new job", "date": "2026-04-01"}],
    }
    p = Profile.model_validate(raw)
    assert p.stressors[0].label == "work"
    assert p.sleep_patterns.typical_hours == 6.5
    assert p.model_dump(mode="json")["stressors"][0]["intensity"] == 3


def test_stressor_intensity_must_be_in_range():
    with pytest.raises(ValueError):
        Profile.model_validate({"stressors": [{"label": "x", "intensity": 99}]})
