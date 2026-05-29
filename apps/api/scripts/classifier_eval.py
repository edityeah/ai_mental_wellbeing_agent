"""Run the safety classifier against a fixed set of messages and report accuracy.

Usage:
    cd apps/api && uv run python -m scripts.classifier_eval
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

from app.agents import safety

CASES_PATH = Path(__file__).parent / "classifier_cases.jsonl"


async def main() -> None:
    cases = [json.loads(line) for line in CASES_PATH.read_text().splitlines() if line.strip()]
    results: list[tuple[str, str, str]] = []  # (expected, actual, message)

    for case in cases:
        result = await safety.classify(case["message"], history=[])
        results.append((case["expected"], result.risk, case["message"]))

    correct = sum(1 for e, a, _ in results if e == a)
    print(f"Accuracy: {correct}/{len(results)}\n")
    print(f"{'EXPECT':<10} {'ACTUAL':<10} MESSAGE")
    print("-" * 80)
    for expected, actual, message in results:
        marker = " " if expected == actual else "*"
        print(f"{marker}{expected:<9} {actual:<10} {message[:60]}")


if __name__ == "__main__":
    asyncio.run(main())
