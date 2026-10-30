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
Status: Accepted (2026-10-22, after local audit run 1; bbox boundary may still be tightened)
Context: Rudraprayag appeared repeatedly in research on highway blockages, cloudbursts, and wildlife conflict. Its Mandakini and Alaknanda valleys carry heavily used highways.
Decision (proposed): Use a 20–30 km corridor in Rudraprayag district. Exact boundary decided during the data audit, based on road coverage, facility locations, and population data.
Evidence so far (desk audit, 2026-10-22): Rudraprayag is a GSI landslide forecast district; published landslide studies and GSI susceptibility data exist for it; PMGSY and Census-linked village layers exist for the state; the DEM is openly available. Not yet established: OSM road completeness, clinic coordinates, usable village population. See `docs/DATA.md` section 6.
Local audit run 1 result: clean DEM, 94% of road length in one connected component, 71 facilities with coordinates. Gaps (village locations, population, facility tiers, road classes) are fixable inside the corridor. Note the bbox is about 33 by 48 km, larger than the original 20 to 30 km corridor idea. Keep the whole bbox for the road graph, since isolation depends on the wider network, and use level of detail in rendering.
Consequences: If later work shows the data cannot support it, switch corridors and record the change here as a new ADR.

## ADR-007: OSM as the primary road source; PMGSY GeoSadak as cross-check and gap-filler
Date: 2026-10-22
Status: Proposed — confirm after the local audit
Context: OSM completeness in the hills is unknown. PMGSY publishes rural roads, about a million habitation points, and a facilities layer under the Government Open Data Licence India, and is a credible source for village roads that OSM may lack. Its Uttarakhand facilities coverage was reported as incomplete.
Decision (proposed): Build the graph from OSM. Use PMGSY to cross-check connectivity of villages and to patch missing village roads through explicit patch files (RULES D2). If the audit shows PMGSY covers the corridor better than OSM, reverse the roles in a new ADR.
Consequences: Two sources to reconcile, with licence and attribution duties for both. Better chance of a connected, credible village network.

## ADR-008: Curated facility tiers; emergency access counts only CHC and above
Date: 2026-10-22
Status: Accepted
Context: The audit found 71 mapped facilities, mostly sub-centres. OSM tags do not reliably give a tier, and several are private clinics or restricted-access (ITBP, ECHS). Counting a sub-centre as a working clinic would badly overstate access in an emergency.
Decision: Tiers are curated in an explicit patch file (`pipeline/patches/facility_tiers.csv`, one row per facility: id, name, tier, verified source). The audit's name-based tier is only a first guess. Metrics are reported for two target sets: `primary` (PHC and above) and `emergency` (CHC, trauma centre, district hospital). Sub-centres, private clinics and restricted-access facilities are excluded from the emergency set.
Consequences: Manual curation of about 70 rows (a few hours). A much more defensible access metric. Facilities with an unknown tier are excluded until curated.

## ADR-009: Render in a local flat-earth frame; web dependency set for M2
Date: 2026-10-22
Status: Accepted
Context: M2 needs terrain and roads on screen quickly. A projected CRS would need `pyproj` and a conversion step in the pipeline and in the browser. Over a corridor of roughly 33 by 48 km, a local frame centred on the corridor distorts east-west distances by about 0.2% at the edges, which is invisible in a visualisation. Simulation distances do not use these coordinates.
Decision: The web app converts WGS84 to a local metre frame (`web/src/lib/geo.ts`) for rendering only. Simulation lengths come from geodesic lengths computed in the pipeline. This amends the earlier wording in ARCHITECTURE section 5.
Dependencies added to `web/` (RULES C9): react and react-dom (UI); three (rendering); @react-three/fiber (declarative three.js in React); @react-three/drei (OrbitControls only; revisit if it grows); zustand (state). Dev: typescript, vite, @vitejs/plugin-react, vitest, eslint with typescript-eslint, and type packages. Versions are caret ranges of releases at least several months old at the time of writing.
Consequences: No pyproj dependency. If a projected CRS is needed later (for example for area calculations), add it in a new ADR.

## ADR-010: Routing graph rules and simulation scope for M3
Date: 2026-10-24
Status: Accepted
Context: M3 needs a graph the simulation can route on, built from OSM data that is patchy in the hills, and a clear rule for what counts as an event effect.
Decision:
- Roads are undirected and drivable only; tracks are excluded. One-way tags are ignored.
- Ways are clipped to the terrain mesh box, like the viewer. Chains of degree-2 vertices collapse into edges, which break where class or bridge flag changes and at snapped vertices.
- Villages snap to the nearest road vertex within 500 m, facilities within 300 m. Snapping is to vertices, not segments, which is acceptable because OSM roads here are densely digitised (about 30 m between vertices in the audit); revisit if a long straight segment causes a miss.
- Places counted: city, town, village, hamlet, isolated dwelling. Suburbs are excluded as neighbourhoods inside towns.
- Travel time uses an assumed average speed per road class (`web/src/sim/assumptions.ts`). Slope is not modelled yet.
- Event effects are measured against each place's own baseline. Unconnected places and places with no baseline route are reported separately (SPEC section 6).
- Scenario runs happen on the main thread until agents arrive in M5 (see ARCHITECTURE section 7).
Known limitation: roads and facilities outside the mesh box are not in the graph, so places near the box edge can look more isolated or more delayed than they are. Show this in the data notes; widen the fetch box if it matters.
Consequences: Fast, testable, explainable runs. Several modelled values (speeds, clearance times) are assumptions and are shown as such. Results near the box edge need care.

## ADR-011: Interaction model for scenario S1 (M4)
Date: 2026-10-24
Status: Accepted
Context: The demo needs a fast, obvious way to trigger a landslide and read its consequences, without hidden modes or dead controls.
Decision:
- A road is chosen by clicking the terrain: the click's world point is matched to the nearest road segment within a tolerance that grows with camera distance (about 1.2% of the distance, at least 150 m). Drags that rotate the view are ignored. Terrain is raycast only on click, never on pointer move, so the 245,000-triangle mesh does not slow hovering.
- Results recompute on every change (segment, severity, threshold). A run takes milliseconds, so there is no Run button.
- The map shows rings for places cut off and cones for places the event newly pushed over the delay threshold. Places already beyond the threshold before the event are not marked, because the event did not cause that.
- The timeline steps through the run's snapshots (the moment of the slide, then each reopening). The before/after switch changes the map and, in the table, the figures are always shown side by side.
- The "most critical roads" shortcuts list the single worst segment of each named road, so one long highway does not fill the list.
Consequences: Easy to demo and test. Picking depends on the draped road lines and the nearest-segment search; a click far from any road does nothing except show a hint.

## ADR-012: Visual language, marker sizing and the ground block (design pass 1)
Date: 2026-10-24
Status: Accepted
Context: The first interactive build drew scenario markers in world units that grew with camera distance, so 142 cut-off places merged into red smears, and the terrain was a bare sheet with no underside. The interface was a dense single column.
Decision:
- Every marker is sized in screen pixels (world units per pixel at the orbit point), so markers stay small and constant at any zoom. Facility markers are slim pins; cut-off places are thin rings, newly delayed places small cones, the closed road a slim post. Shape carries the meaning and colour backs it up.
- Smaller facility pins appear only when zoomed in.
- The terrain sits on a solid block with layered soil and stone on all four sides, built from the terrain's own edge profile (`lib/block.ts`).
- Layout: controls in a left rail; layer switches, results, legend and facility details float over the map; data notes, sources and assumptions fold away. Results are three tiles (cut off, beyond the threshold, typical access) with the before value under each.
- Motion is short and functional: cards rise in, numbers count to new values, markers ease in. All of it switches off under `prefers-reduced-motion`.
- The legend draws each symbol as it appears on the map, and scenario symbols appear only while a scenario is running.
Consequences: A calmer, more legible interface. Marker sizes are fixed pixel values chosen by eye and may need tuning on other screens.

## ADR-013: The AI situation brief service (M6)
Date: 2026-10-25
Status: Accepted
Context: Judges score meaningful use of AI, and the project's AI element is the brief written from the simulation's numbers. It must be impossible for the model to put an invented figure in front of an officer, the key must stay secret, and the demo must still work when the AI service does not.
Decision:
- The model narrates and never computes. Every number in its answer must appear in the input (digits in names included); derived numbers are rejected. Checked on the server and again in the browser. One correction retry, then an error.
- Plain-JSON replies, parsed and validated, rather than forced tool use. Verified against the current model documentation: Sonnet 5.5 rejects `temperature`, assistant prefill and forced tool choice, and `thinking: disabled`; adaptive thinking is on by default and shares `max_tokens` with the reply. The request therefore sends only model, `max_tokens` (generous), system prompt and messages. A test asserts the request carries none of the rejected fields.
- Default model `claude-haiku-5-5` for speed and cost; `ANTHROPIC_MODEL` switches to `claude-sonnet-5-5`. Direct HTTP with `fetch`, no SDK dependency.
- Names from open map data are untrusted text going to a model: control characters stripped, length capped, and the prompt says to treat them as data. The output check limits what an injected instruction could achieve.
- One handler, two adapters (Vite dev route, Netlify function). The API key is only ever read from server-side environment variables.
- Fallback is a rule-based template from the same numbers, validated by the same code, labelled "Template summary, not AI" with the reason. Chosen over pre-generated AI briefs because those would go stale whenever an assumption changes.
Consequences: The demo never shows a broken brief. A per-instance rate limit is not enough protection for a public site with a paid key; before sharing a public link, set a spending limit on the key. Netlify's default function time limit may be shorter than a slow answer; if briefs time out in production, use Haiku or raise the limit. Hindi quality depends on the model and has not been reviewed by a Hindi speaker.

## ADR-014: A local Ollama model is the default writer of the brief
Date: 2026-10-25
Status: Accepted
Context: The author chose Qwen 3.5 4B, already installed under Ollama, over a paid API: free, no key to protect, nothing leaves the machine, and good enough for a short narration of numbers the simulation already produced. A 4B model is more likely than a large one to break the number rule or to write weak Hindi.
Decision:
- Add Ollama as a second provider behind the same handler, validation, retry and fallback (ADR-013). The default is a local model, `qwen3.5:4b`, with no configuration. A Claude key, or `BRIEF_PROVIDER=anthropic`, switches to the Claude API.
- Verified against Ollama's native API documentation: `POST /api/chat` takes `stream`, `format` (a JSON schema, enforced during generation), a top-level `think`, `keep_alive` and `options`. Sources disagree on whether the Qwen 3.5 small models think by default, so thinking is switched off explicitly; if a build rejects the `think` field, the request is repeated without it.
- Three measures for the small model: schema-constrained output with `metric_refs` limited to real keys; an explicit list of the numbers it may write in every request; one worked example in its system prompt. The number check, one correction retry and the labelled template fallback still apply, so a failing model costs a few seconds, never a wrong number.
- Errors are explained to the person: Ollama not running, or the model not pulled (with the exact `ollama pull` command), appear under the template brief.
Consequences: No key, no cost, works offline. Quality is lower than a large model, and Hindi in particular needs a Hindi speaker's review before anyone relies on it; `OLLAMA_MODEL=qwen3.5:9b` is the first thing to try if quality or number discipline disappoints. A hosted deployment cannot reach a model on the author's computer, so a public link would show the template fallback unless the Claude API is configured. Not yet tried by the author against a real Ollama, so exact behaviour of the `think` and `format` fields on this build is unconfirmed.

## ADR-015: The report is a self-contained printable page
Date: 2026-10-26
Status: Accepted
Context: The project needs an after-action report to attach to a submission or hand to an officer, without adding a PDF library or a server.
Decision:
- The report is one complete HTML page built from plain data by a pure function (`web/src/report/buildReport.ts`), opened in a new tab through a Blob URL. The browser's print dialog produces the PDF. The page carries A4 print rules, and the instruction to press Ctrl+P is hidden on paper.
- A Blob page shares the app's origin, so it is locked down: a content-security policy forbids scripts and all outside requests, every value is HTML-escaped (place and road names come from open map data), and the only image allowed is an inline JPEG or PNG data URL.
- The map picture is taken by drawing one frame and reading the canvas back in the same step, through a small bridge registered by the 3D view.
- The page includes the run record, so a reader can see exactly what inputs and seed produced the numbers.
- If the new tab is blocked, the same page is offered as a file download.
Consequences: No new dependency, works offline. Page breaks and the browser's own header and footer lines in the print dialog are not controlled by the page: turn off "Headers and footers" in the print options for a clean copy. The map picture depends on the browser allowing canvas readback, and falls back to no picture if it does not.

## ADR-016: Population is a modelled estimate from a gridded dataset, shown at the top
Date: 2026-10-27
Status: Accepted
Context: How many people a closure cuts off is the headline of the project, but no village-level population was loaded. Census village figures need manual downloads and name matching that cannot be checked without the files; a gridded dataset can be applied automatically.
Decision:
- Use WorldPop 2020, India, 100 m, constrained to built-settlement areas (CC BY 4.0). The corridor window is read straight from the published raster, so no 500 MB download is needed; a downloaded file also works.
- Each raster cell's people are shared equally among the places inside the cell; a cell with no place inside goes to the nearest place within 3 km; the rest are reported as unallocated. Nothing is created or lost (tested).
- The result is written to `data/processed/population.json` and attached to the graph (`population`, `population_source`). Every figure is labelled an estimate: approximate sign, rounded, tagged, and cited in the app, the report and the brief.
- The top bar shows the corridor total and the people cut off by the current scenario. People in places the model cannot analyse are reported separately, never counted as safe.
Consequences: Immediate, reproducible numbers with honest labelling. Estimates for single hamlets are rough, and 2020 modelled data is not the census; official Census 2011 figures should replace them where available (the file format already carries a `census` kind). Not yet run by the author against the real raster.

## ADR-017: News comes from a scheduled job, not from the browser
Date: 2026-10-27
Status: Accepted
Context: The news card needs fresh, area-relevant headlines with a picture each, on a static host with no server. Browsers cannot read most news feeds (no cross-origin permission), and the headline search service that supplies article pictures should not be hit by every visitor.
Decision:
- A small script (`pipeline/news.py`) asks the GDELT Project for English and Hindi articles that mention the corridor's places, or Uttarakhand with roads, weather or health topics. It keeps only relevant headlines (a place-name match; Uttarakhand-wide items only with a topic; headlines about the film Kedarnath are dropped), removes duplicates and anything older than 30 days, and writes `news.json`.
- The GitHub Actions deploy runs it every three hours and on every push, so the hosted site always carries a recent list with no server and no third-party request at view time. A failed fetch never blocks a deploy.
- The page re-reads the list every 15 minutes and on Refresh. Filters (Local, Roads, Weather, Health) work on tags added by the script. Links open at the publisher; images load from the publisher and fall back to a letter tile.
Consequences: Fresh within about three hours, resilient, no keys. Relevance is keyword-based and will occasionally let a headline through or miss one. GDELT can be slow or rate-limited; then the card says news is unavailable. Not yet run by the author against the live service.

## ADR-018: Hosting on GitHub Pages; the AI brief is local-only
Date: 2026-10-27
Status: Accepted
Context: The author will host the same repository on GitHub Pages. A static host cannot run the brief's server route, and a hosted page cannot reach a model on a visitor's computer.
Decision: A workflow (`.github/workflows/pages.yml`) builds and deploys the site on every push, by hand, and every three hours. The build uses the base path `/Setu/`. The brief is flagged "Local AI only"; on a hosted copy it skips the network request and shows the labelled template with a note saying there is no local model; on a local copy with Ollama stopped it says to start Ollama. Reading a local model from a hosted page was rejected as unreliable (browser rules on reaching a local network from a public page).
Consequences: Visitors see everything except the AI-written brief, which is demonstrated from the author's own computer. The processed data under `data/processed` must be committed for the build to work.
