# pipeline

Offline Python data tooling for Setu. Heavy GIS work happens here, never in the browser.

## Data audit (run first)

From the repo root, with internet access:

```
pip install -r pipeline/requirements.txt
python -m pipeline.fetch_osm --area rudraprayag    # roads, health, places, building count (Overpass)
python -m pipeline.fetch_dem --area rudraprayag    # Copernicus GLO-30 tiles
python -m pipeline.audit --area rudraprayag        # writes data/audit/rudraprayag.json and prints a summary
```

Paste the printed summary into `docs/DATA.md` section 6.

What the audit tells you: road length by class, tag coverage, how fragmented the road network is, how many villages and clinics sit on the main network (with and without tracks), building count, and DEM voids and elevation range.

Notes:

- Fetching is polite by design (retries with backoff, pauses between queries). Run it once and reuse `data/raw/`, which is gitignored.
- The audit reads `data/raw/` and never modifies it.
- The DEM check needs `rasterio`; without it the audit skips DEM statistics and says so. That code path has not been executed yet.
- Audit thresholds (snap distances, minimum fragment length) are audit heuristics, not model assumptions.
- Corridor bounds live in `pipeline/config.py` and are proposed, not final (ADR-006).

## Tests

```
python -m unittest discover -s pipeline/tests -t .
```

These run offline on a small synthetic corridor.

## Build

```
python -m pipeline.build --area rudraprayag         # terrain, roads, facility and place markers for the viewer
python -m pipeline.build_graph --area rudraprayag   # routing graph for the simulation (needs the build above first)
```

## Facility tiers (review sheet)

```
python -m pipeline.build_graph --area rudraprayag --write-tier-template
```

Writes `pipeline/patches/facility_tiers.csv`: one row per facility with a name-based `tier_guess`. Fill the `tier` column where the guess is wrong or blank (allowed values are printed by the command), save, then run `build_graph` again. Re-running the template command keeps your edits. A typo in `tier` stops the build with the line number.

## Not yet written

`pipeline.validate`. See `docs/DATA.md` for schemas.
