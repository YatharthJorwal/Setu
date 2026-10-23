# DATA — Setu

Status: v0.2 (desk audit done 2026-10-22; local audit pending). Statuses in section 1 say what has been confirmed from published sources and what has not been tested on real files. Do not state that a dataset is adequate for the corridor until the local audit (section 4) has run.

## 1. Datasets needed

Status key: **DESK-VERIFIED** = a source confirms the dataset exists and states its terms; **NOT YET TESTED** = nobody has downloaded and inspected it for this corridor. Nothing is fully VERIFIED until the local audit (section 4) has been run on real files.

| Need | Source | Status | Notes |
|---|---|---|---|
| Terrain (DEM) | Copernicus GLO-30 Public (about 30 m), free public AWS bucket, Cloud Optimized GeoTIFF | **VERIFIED** (2026-10-22 local audit) | Both tiles downloaded; 1,948,932 samples in the bbox, 0% voids, elevation 594 to 4,655 m. Free under the Copernicus licence (read the text; record attribution wording). Surface model (includes buildings and vegetation). 30 m is far more than the browser needs: downsample to roughly 90 to 120 m for the mesh. |
| Roads | OpenStreetMap via Overpass (`pipeline/fetch_osm.py`) | **PARTIAL** (2026-10-22 local audit) | 804 ways, about 1,558 km including tracks. Network without tracks is 1,408 km with 94% of length in one connected component. Weak attributes: 60% of length is `unclassified` (village roads and unknown mixed), names on 1.6% of ways, surface on 4.9%, maxspeed on 12.7%, so speeds must come from the assumptions table. 149 ways are tagged as bridges (useful for the flood scenario). Detached fragments are mostly on the western bbox edge and are probably clipping artifacts; see section 6. ODbL, attribution required. |
| Roads (cross-check, village roads) | PMGSY GeoSadak open data (Ministry of Rural Development / NRIDA): rural roads, habitations (about 1 million points), facilities, under the Government Open Data Licence India | DESK-VERIFIED, NOT YET TESTED | https://geosadak-pmgsy.nic.in/OpenData. Candidate gap-filler for village roads and habitations. Check layer coverage for Rudraprayag and the data currency. |
| Buildings | OpenStreetMap | **UNUSABLE FOR POPULATION** (2026-10-22 local audit) | Only 3,070 buildings are mapped in a bbox with roughly 790 place nodes. Far too sparse to estimate population. The building-count fallback is dropped; population must come from Census-linked or PMGSY habitation data. |
| Villages: location | Census-2011-linked village points and polygons (ML InfoMap 2014 via Stanford Earthworks; SHRUG and PC11 polygons on AIKosh); PMGSY habitation points; OSM place nodes | DESK-VERIFIED, NOT YET TESTED | Licence differs by copy. SHRUG and PC11 polygon sets are CC BY-NC-SA 4.0 (non-commercial, share-alike), with positional errors up to about 1 km reported for PC11. Princeton's copy is listed as restricted access. Read each licence before use. |
| Villages: population | Census of India 2011 Primary Census Abstract, linked in the datasets above | DESK-VERIFIED, NOT YET TESTED | 2011 figures are about 15 years old; the UI must say so. Fallback: building-count estimate with a stated persons-per-household assumption. |
| Health facilities: names and tiers | State health authority hospital lists name the Rudraprayag District Hospital, CHC Agastmuni and CHC Jakholi; a Rudraprayag contacts page lists PHC Ukhimath | PARTIAL | Names only, with no coordinates. Locations must come from OSM, the PMGSY facilities layer, or manual placement checked against imagery. Aggregator sites list further PHCs but flag their own map positions as approximate; do not rely on them. |
| Health facilities: locations | OSM (looks like an imported health-facility dataset); PMGSY facilities layer | **PARTIAL** (2026-10-22 local audit) | 71 facilities with coordinates, 59 within 300 m of a mapped road, 57 on the main network. Mostly sub-centres. The list includes District Hospital Rudraprayag, CHC Karnaprayag, CHC Pokhari, CHC Ratura, PHC Chopta, PHC Ukhimath, PHC Guptkashi and a trauma centre. "Augustmuni" appears with no tier in its name; CHC Jakholi (named in the state list) was not found by name. 12 facilities sit over 300 m from any road (several 1 to 3 km), which means unmapped village roads or approximate positions. Tiers must be curated by hand (ADR-008). |
| Landslide susceptibility and inventory | GSI National Landslide Susceptibility Mapping (1:50,000) and a database of about 91,000 historical landslides, via GSI Bhukosh and NGDR for free download; NRSC Landslide Atlas of India | DESK-VERIFIED, NOT YET TESTED | Per a Ministry of Earth Sciences reply. Confirm that Rudraprayag layers are downloadable and under what terms. Not essential for v1 (scenarios are user-triggered). |
| Landslide forecasts | GSI Regional Landslide Forecasting System; operational and experimental bulletins since the 2025 monsoon for 21 districts including Rudraprayag | DESK-VERIFIED | Context, not an input. Setu does not forecast; it shows consequences. See SPEC section 2. |
| Rivers and waterways | OSM waterways; flow accumulation from the DEM | NOT YET TESTED | Needed only for the flash-flood scenario (stretch). |
| Rainfall | IMD gridded data | NOT NEEDED FOR V1 | Scenarios are user-triggered, not forecast-driven. |

## 2. Processed artifacts and schemas

All geometry in WGS84 (EPSG:4326) unless stated. The graph is also provided in the corridor's projected CRS in metres.

### `graph.json`

```
{
  crs: { geographic: "EPSG:4326", projected: "EPSG:32644" },
  bounds: { west, south, east, north },
  nodes: [ { id, lon, lat, x_m, y_m, elevation_m, kind: "junction" | "village_access" | "facility_access" } ],
  edges: [ {
    id, from, to,
    length_m,
    road_class,            // e.g. national_highway | state_highway | district_road | village_road | track
    bridge: boolean,
    geometry: [ [lon, lat, elevation_m], ... ],
    source: "osm" | "patch"
  } ]
}
```

### `villages.json`

```
[ { id, name, lon, lat, access_node, population, population_method: "census" | "estimated", population_note } ]
```

### `facilities.json`

```
[ { id, name, tier: "phc" | "chc" | "district_hospital" | "other", lon, lat, access_node, source } ]
```

### `provenance.json`

```
[ {
  dataset, source_url, licence, retrieved_on,   // ISO date
  coverage_note, gaps, manual_patches: [ patch_file ... ]
} ]
```

### Terrain tiles

Heightmap tiles with a metadata file giving bounds, tile grid, resolution in metres per sample, elevation encoding, and vertical range.

Exact encodings are finalised during the pipeline build and recorded here.

### Viewer artifacts (M2, written by `python -m pipeline.build`)

These are what the web app loads today. They are a subset of the full schemas above; the routing graph (`graph.json`) arrives with M3.

| File | Contents |
|---|---|
| `terrain.json`, `terrain.f32` | Elevation grid: bounds, cell size, size, elevation range, then float32 little-endian samples, row-major, north to south, at cell centres |
| `roads.json` | Road polylines clipped to the mesh and simplified (about 5 m tolerance) for display: class index, bridge flag, flat lon/lat list. Display only; not the routing graph |
| `facilities.json` | OSM health facilities inside the mesh with a name-based `tier_guess` (ADR-008) |
| `places.json` | OSM place nodes inside the mesh (omitted if the fetch lacks coordinates) |
| `provenance.json` | Per-dataset source, licence, retrieval date, gaps |

`web/scripts/sync-data.mjs` copies `data/processed/` into `web/public/data/` (gitignored) before `npm run dev` and `npm run build`.

## 3. Rules recap

Full rules are in `docs/RULES.md`, section D. In short: raw is immutable and gitignored; processed is reproducible from the pipeline; manual patches are explicit patch files; provenance is mandatory; OSM attribution is required; no personal data.

## 4. Audit checklist (do this before writing sim code)

Run the scripted part on your own machine (it needs internet; the build sandbox has none):

```
pip install -r pipeline/requirements.txt
python -m pipeline.fetch_osm --area rudraprayag
python -m pipeline.fetch_dem --area rudraprayag
python -m pipeline.audit --area rudraprayag
```

This writes `data/audit/rudraprayag.json` and prints a summary to paste into section 6. Then work through the checklist. The unit tests for the audit logic run offline: `python -m unittest discover -s pipeline/tests -t .`

The DEM statistics code path in `audit.py` has not been run (rasterio was unavailable where it was written). If it errors, fix it before relying on it.

For the Rudraprayag corridor (or the corridor chosen in ADR-006):

- [ ] DEM: obtained, licence read and recorded, resolution confirmed, voids checked
- [ ] Roads: extracted, plotted over the DEM, gaps and obviously wrong geometry listed
- [ ] Road classes usable (can we tell highway from village road?)
- [ ] Bridges identifiable
- [ ] Villages: names and coordinates obtained; population source identified; coverage estimated (how many corridor villages have a usable population figure)
- [ ] Facilities: list obtained, tiers known, locations verified against the map
- [ ] Is the road graph connected where it should be? (Isolated fragments listed)
- [ ] Landslide data: access terms checked; fallback heuristic noted if unavailable
- [ ] Decision recorded: corridor boundary, CRS, population method, facility source
- [ ] Update every row in section 1 to VERIFIED, PARTIAL, or UNAVAILABLE, with a note on what was actually inspected

Output of the audit: a short "Data audit" section appended here, plus an ADR if the corridor or method changes.

## 5. Attribution (to display in the app)

- OpenStreetMap: "© OpenStreetMap contributors" (ODbL)
- Copernicus DEM: free under the Copernicus licence; exact attribution wording to be copied from the licence text once read
- PMGSY GeoSadak data: Government Open Data Licence India; cite the source as the licence requires (the OMMAS rural facilities page asks for "PMGSY Rural Dataset, 2020" with its URL)
- Census-linked village layers: wording and any non-commercial or share-alike conditions per the copy actually used

## 6. Data audit log

### 2026-10-22: desk audit (published sources only, no files downloaded)

Findings:
- Copernicus GLO-30 Public is openly downloadable from a public bucket as Cloud Optimized GeoTIFF; free for the general public under the Copernicus licence. Two tiles (N30 E078, N30 E079) cover the proposed corridor. Not yet downloaded.
- PMGSY GeoSadak open data (roads, about 1 million habitation points, facilities) is a credible second source for village roads and habitations. The facilities collection was reported as incomplete in Uttarakhand.
- Census-linked village points and polygons exist but under varying licences (some non-commercial and share-alike, one copy restricted). Population is 2011 vintage.
- Health facility names and tiers for Rudraprayag district are published (District Hospital Rudraprayag, CHC Agastmuni, CHC Jakholi, PHC Ukhimath), without coordinates.
- GSI publishes landslide susceptibility maps and a historical landslide database for free download, and has issued landslide forecast bulletins for Rudraprayag since the 2025 monsoon.
- A 2025 conference abstract on Rudraprayag reports 196 confirmed landslide locations from 2019 to 2023, with most concentrated near road networks. This supports modelling road-segment landslides (S1). It is one study; cite it as such.

Not established: OSM road completeness in the corridor, whether a corridor-sized subset of village population is usable, clinic coordinates, whether the PMGSY layers cover the corridor.

Next: run the local audit (section 4) and append its summary below.

### 2026-10-22: local audit, run 1 (real files)

Command: `python -m pipeline.audit --area rudraprayag` on OSM data fetched 2026-10-22 and the two Copernicus GLO-30 tiles. Raw summary is in `data/audit/rudraprayag.json`.

- **DEM:** 2 tiles, 1,948,932 samples in bbox, 0% voids, 594 to 4,655 m. Clean.
- **Roads:** 804 ways. Length by class (km): unclassified 939.0, trunk 187.6, track 149.0, tertiary 109.7, primary 93.4, secondary 39.5, residential 21.3, service 17.4. Tag coverage: name 1.6%, ref 18.2%, surface 4.9%, maxspeed 12.7%, bridge 18.5% (149 ways).
- **Network without tracks:** 48,411 nodes, 1,408.2 km, 7 components, main component 94.4% of length. Six detached fragments over 0.3 km. Three of the largest (23.3, 21.6 and 19.5 km) have centroids at longitude about 78.885 to 78.92, on or beyond the western bbox edge (78.90). Likely explanation: the fetch returns ways that cross the bbox, but connecting roads lying wholly outside it are not fetched, so these look detached. Not yet confirmed by plotting. One interior fragment (4.5 km near 79.07 E, 30.60 N) is worth inspecting by eye.
- **Network with tracks:** 1,557.2 km, 12 components, main 95.6%.
- **Facilities:** 71 found, 59 within 300 m of a road, 57 on the main network. The 2 within 300 m but off the main network (SubCentre Randhar and SubCentre Chaunra) lie at the western edge, consistent with the clipping explanation.
- **Buildings:** 3,070 mapped. Unusable for population.
- **Places: BUG.** 792 place elements were fetched but the audit saw 0 with coordinates, because the query used `out tags` (no coordinates). Fixed in `fetch_osm.py` (`out body`), with a warning added to the audit and a regression test. Re-fetch needed: `python -m pipeline.fetch_osm --area rudraprayag --only places`.

Conclusions so far (see ADR-006, ADR-008):
- Rudraprayag is workable. Terrain is clean, roads are largely connected, facilities exist with names and locations.
- Remaining gaps: village locations (re-fetch pending), population (needs Census-linked or PMGSY habitation data, downloaded by hand), facility tiers (curate), road classes (assume speeds by class).
