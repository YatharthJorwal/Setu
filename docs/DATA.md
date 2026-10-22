# DATA — Setu

Status: draft v0.1. **Every source below is a candidate and UNVERIFIED** until the data audit (section 4) records otherwise. Do not state that a dataset is available, current, or adequate until it has been checked.

## 1. Datasets needed

| Need | Candidate sources | Status | Notes |
|---|---|---|---|
| Terrain (DEM) | Copernicus GLO-30 (30 m); SRTM (about 30 m); ISRO CartoDEM via Bhuvan | UNVERIFIED | Check licence text, resolution over the corridor, and download route. Void-fill if needed. |
| Roads | OpenStreetMap (Overpass API or a regional extract) | UNVERIFIED | Hill coverage may be patchy. Expect manual patches. ODbL licence, attribution required. |
| Buildings / settlements | OpenStreetMap | UNVERIFIED | Used to estimate population if census data cannot be placed. |
| Villages and population | Census of India 2011 village directory (aggregate) | UNVERIFIED | Placing villages on the map (coordinates) may be non-trivial. Fallback: OSM place nodes plus building-count estimate. |
| Health facilities | OpenStreetMap; state or National Health Mission facility lists | UNVERIFIED | Need tier (PHC, CHC, district hospital) and a location. |
| Rivers and waterways | OpenStreetMap waterways; flow accumulation derived from the DEM | UNVERIFIED | Needed for the flash-flood scenario (stretch). |
| Landslide inventory or susceptibility | Geological Survey of India; ISRO/NRSC landslide atlas | UNVERIFIED | Check access terms. Fallback: a slope-and-road-cut heuristic, labelled as an assumption. |
| Rainfall | IMD gridded data | UNVERIFIED | Probably not needed for v1. Scenarios are user-triggered, not forecast-driven. |

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
- [ ] Update every row in section 1 from UNVERIFIED to VERIFIED, PARTIAL, or UNAVAILABLE, with a note

Output of the audit: a short "Data audit" section appended here, plus an ADR if the corridor or method changes.

## 5. Attribution (to display in the app)

- OpenStreetMap: "© OpenStreetMap contributors" (ODbL)
- DEM and any other source: exact required wording recorded here once licences are read

## 6. Data audit log

_Empty. Add dated entries here._
