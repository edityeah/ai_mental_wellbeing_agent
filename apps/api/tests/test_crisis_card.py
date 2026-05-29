from app.crisis.card import CRISIS_CARD_TEXT, helplines


def test_card_contains_required_helplines():
    text = CRISIS_CARD_TEXT
    assert "iCall" in text
    assert "Vandrevala" in text
    assert "1860-2662-345" in text
    assert "14416" in text


def test_card_contains_grounding_exercise():
    assert "5 things you can see" in CRISIS_CARD_TEXT
    assert "1 thing you can taste" in CRISIS_CARD_TEXT


def test_helplines_list_is_structured():
    items = helplines()
    assert any(h["number"] == "14416" for h in items)
    assert all(set(h.keys()) >= {"name", "number"} for h in items)
