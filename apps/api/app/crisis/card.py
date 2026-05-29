from __future__ import annotations


def helplines() -> list[dict[str, str]]:
    """Verified Indian mental health helplines as of 2026-05.

    Aditya: confirm these are current before each release.
    """
    return [
        {"name": "iCall (free, confidential)", "number": "9152987821"},
        {"name": "Vandrevala Foundation (24/7)", "number": "1860-2662-345"},
        {"name": "AASRA (suicide prevention)", "number": "9820466726"},
        {"name": "Emergency psychiatric care", "number": "14416"},
        {"name": "National mental health support", "number": "1800-599-0019"},
    ]


def _format_helplines(items: list[dict[str, str]]) -> str:
    return "\n".join(f"📞 {h['name']}: {h['number']}" for h in items)


CRISIS_CARD_TEXT = f"""I hear that things feel really heavy right now, and I want to stop and be with you for a moment.

What you're feeling is real, and you don't have to face it alone. Please reach out to a person who can be with you right now — a trusted friend, family member, or one of these numbers in India:

{_format_helplines(helplines())}

While you wait or decide, try this with me — 5-4-3-2-1:
  • Name 5 things you can see right now.
  • 4 things you can touch.
  • 3 things you can hear.
  • 2 things you can smell.
  • 1 thing you can taste.

I'll be here when you're ready to keep talking. You matter."""
