# DATA — Setu

Status: v0.2 (desk audit done 2026-10-22; local audit pending). Statuses in section 1 say what has been confirmed from published sources and what has not been tested on real files. Do not state that a dataset is adequate for the corridor until the local audit (section 4) has run.

## 1. Datasets needed

Status key: **DESK-VERIFIED** = a source confirms the dataset exists and states its terms; **NOT YET TESTED** = nobody has downloaded and inspected it for this corridor. Nothing is fully VERIFIED until the local audit (section 4) has been run on real files.

| Need | Source | Status | Notes |
|---|---|---|---|
| Terrain (DEM) | Copernicus GLO-30 Public (about 30 m), free public AWS bucket, Cloud Optimized GeoTIFF, 2021 release | DESK-VERIFIED, NOT YET TESTED | Free for the general public under the Copernicus licence (read the text; record attribution wording). Registry notes the public GLO-30 set omits a small subset of tiles for specific countries; `fetch_dem` reports a 404 if our two tiles are missing. It is a surface model (includes buildings and vegetation). Fallback: GLO-90 (90 m). |
| Roads | OpenStreetMap via Overpass (`pipeline/fetch_osm.py`) | NOT YET TESTED | ODbL, attribution required. Hill completeness unknown; the audit measures it. |
| Roads (cross-check, village roads) | PMGSY GeoSadak open data (Ministry of Rural Development / NRIDA): rural roads, habitations (about 1 million points), facilities, under the Government Open Data Licence India | DESK-VERIFIED, NOT YET TESTED | https://geosadak-pmgsy.nic.in/OpenData. Candidate gap-filler for village roads and habitations. Check layer coverage for Rudraprayag and the data currency. |
| Buildings | OpenStreetMap | NOT YET TESTED | The audit reports a building count. Hill coverage may be thin. |
| Villages: location | Census-2011-linked village points and polygons (ML InfoMap 2014 via Stanford Earthworks; SHRUG and PC11 polygons on AIKosh); PMGSY habitation points; OSM place nodes | DESK-VERIFIED, NOT YET TESTED | Licence differs by copy. SHRUG and PC11 polygon sets are CC BY-NC-SA 4.0 (non-commercial, share-alike), with positional errors up to about 1 km reported for PC11. Princeton's copy is listed as restricted access. Read each licence before use. |
| Villages: population | Census of India 2011 Primary Census Abstract, linked in the datasets above | DESK-VERIFIED, NOT YET TESTED | 2011 figures are about 15 years old; the UI must say so. Fallback: building-count estimate with a stated persons-per-household assumption. |
| Health facilities: names and tiers | State health authority hospital lists name the Rudraprayag District Hospital, CHC Agastmuni and CHC Jakholi; a Rudraprayag contacts page lists PHC Ukhimath | PARTIAL | Names only, with no coordinates. Locations must come from OSM, the PMGSY facilities layer, or manual placement checked against imagery. Aggregator sites list further PHCs but flag their own map positions as approximate; do not rely on them. |
| Health facilities: locations | OSM; PMGSY facilities layer | NOT YET TESTED | The PMGSY facilities data collection was reported as still in progress in Uttarakhand, so coverage may be incomplete. |
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
