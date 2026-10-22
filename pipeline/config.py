"""Corridor definitions and shared paths for the Setu data pipeline."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
AUDIT = ROOT / "data" / "audit"


@dataclass(frozen=True)
class Area:
    key: str
    west: float
    south: float
    east: float
    north: float
    crs_projected: str
    note: str

    @property
    def bbox_wsen(self) -> tuple[float, float, float, float]:
        return (self.west, self.south, self.east, self.north)


# Bounds are approximate and PROPOSED (see docs/DECISIONS.md ADR-006).
# Roughly: Rudraprayag town and the Alaknanda confluence in the south-west,
# up the Mandakini valley through Agastmuni, Ukhimath and Guptkashi to
# Sonprayag in the north-east. Tighten after looking at the audit output.
AREAS: dict[str, Area] = {
    "rudraprayag": Area(
        key="rudraprayag",
        west=78.90,
        south=30.25,
        east=79.25,
        north=30.68,
        crs_projected="EPSG:32644",
        note="Proposed Rudraprayag / Mandakini corridor. Verify visually; adjust in ADR-006.",
    ),
}


def get_area(key: str) -> Area:
    try:
        return AREAS[key]
    except KeyError as exc:
        raise SystemExit(f"Unknown area '{key}'. Known: {', '.join(AREAS)}") from exc
