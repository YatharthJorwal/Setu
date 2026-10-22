# DECISIONS — Setu

A log of significant choices. Add an entry before changing a past choice or adding a dependency. Newest entries go at the bottom.

Status values: **Accepted**, **Proposed** (needs confirmation), **Superseded by ADR-N**.

Template:

```
## ADR-NNN: Title
Date: YYYY-MM-DD
Status:
Context: what forced the decision
Decision: what we chose
Consequences: what gets easier, what gets harder, what we gave up
```

---

## ADR-001: Real terrain on a pilot corridor, not a demo city
Date: 2026-10-22
Status: Accepted
Context: The project's value is that it models Uttarakhand's actual geography and its actual cut-off problem. A fictional city would read as a game and carry no credibility with judges or officials.
Decision: Use real terrain, roads, villages, and facilities for one valley corridor of roughly 20–30 km. Do not attempt a whole district.
Consequences: Real data work is required (see `docs/DATA.md`) and may be patchy in the hills. Scope stays bounded by the corridor. Credibility and defensibility are much higher.

## ADR-002: Network model drives outcomes; agents are the visual layer
Date: 2026-10-22
Status: Accepted
Context: A free-roaming agent simulation with random path choices looks like a toy and produces results that are hard to defend.
Decision: Model roads and villages as a graph. Closures mutate edges. Metrics come from graph routing (multi-source Dijkstra from open facilities). Simulated people and ambulances follow shortest paths on the surviving graph and visualise the computed outcome, with scenario-specific behaviour rules.
Consequences: Metrics are deterministic, testable, and explainable. Agent realism is bounded by the rules we write. Agents never decide reported outcomes.

## ADR-003: Offline Python data pipeline producing static artifacts
Date: 2026-10-22
Status: Accepted
Context: DEM and OSM processing is heavy and well served by Python GIS tooling. The browser should load small, validated files.
Decision: `pipeline/` (Python) builds and validates artifacts into `data/processed/`. The web app consumes them statically.
Consequences: Two languages in the repo. The browser stays light and the data is auditable. Pipeline reruns are needed when data or the corridor changes.

## ADR-004: The LLM narrates; it never computes; it is called through a server proxy
Date: 2026-10-22
Status: Accepted
Context: LLMs invent figures. A decision tool that shows invented numbers destroys trust. The API key must not reach the client.
Decision: The app sends computed metrics to `/api/brief`. The server validates input, calls the model, validates output against a schema, and rejects numbers absent from the input. A pre-generated fallback brief covers failures for guided scenarios.
Consequences: The demo works offline for guided scenarios. Free-form briefs need the network. Slightly more server code.

## ADR-005: Stack — React, TypeScript (strict), Vite, react-three-fiber, Zustand, Web Worker
Date: 2026-10-22
Status: Accepted
Context: Declarative 3D inside a React UI, typed core logic, and a responsive interface during simulation runs.
Decision: React + TypeScript + Vite for the app, react-three-fiber / three.js for rendering, Zustand for state, the sim core as pure TypeScript in a Web Worker, Vitest for tests, Netlify for hosting and the serverless function.
Consequences: One main language for the app. Worker messaging adds a boundary to maintain.

## ADR-006: Pilot corridor — Rudraprayag
Date: 2026-10-22
Status: Proposed — confirm after the data audit
Context: Rudraprayag appeared repeatedly in research on highway blockages, cloudbursts, and wildlife conflict. Its Mandakini and Alaknanda valleys carry heavily used highways.
Decision (proposed): Use a 20–30 km corridor in Rudraprayag district. Exact boundary decided during the data audit, based on road coverage, facility locations, and population data.
Evidence so far (desk audit, 2026-10-22): Rudraprayag is a GSI landslide forecast district; published landslide studies and GSI susceptibility data exist for it; PMGSY and Census-linked village layers exist for the state; the DEM is openly available. Not yet established: OSM road completeness, clinic coordinates, usable village population. See `docs/DATA.md` section 6.
Consequences: If the local audit finds data too thin, switch corridors and record the change here as a new ADR.

## ADR-007: OSM as the primary road source; PMGSY GeoSadak as cross-check and gap-filler
Date: 2026-10-22
Status: Proposed — confirm after the local audit
Context: OSM completeness in the hills is unknown. PMGSY publishes rural roads, about a million habitation points, and a facilities layer under the Government Open Data Licence India, and is a credible source for village roads that OSM may lack. Its Uttarakhand facilities coverage was reported as incomplete.
Decision (proposed): Build the graph from OSM. Use PMGSY to cross-check connectivity of villages and to patch missing village roads through explicit patch files (RULES D2). If the audit shows PMGSY covers the corridor better than OSM, reverse the roles in a new ADR.
Consequences: Two sources to reconcile, with licence and attribution duties for both. Better chance of a connected, credible village network.
