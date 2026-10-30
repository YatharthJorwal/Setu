# SPEC — Setu

Status: draft v0.1. Owner: Yatharth. Change this file before changing behaviour.

## 1. One-liner

A 3D simulator on real Himalayan terrain that shows which villages are cut off when roads fail, how far the nearest working clinic becomes, and what to pre-position before the roads go.

## 2. Problem

Uttarakhand's hill roads fail every monsoon, and health services in the hills are thin, so a road closure is also a health-access event.

- In July 2026, landslides blocked 84 roads, including two national highways, under red and orange alerts across 10 districts (The Hitavada, 20 Jul 2026).
- An RTI-based report found 295 specialist doctors working against 840 sanctioned posts across CHCs and district and sub-district hospitals (Medical Dialogues).

Existing tools mostly show hazard risk (landslide early-warning dashboards) or closure lists (road status pages). None found so far models what an isolated village loses when the network breaks. This has been checked with limited searches, not exhaustively. Re-verify before making the claim publicly.

Fact-check both figures against the original reports before quoting them in any submission.

Where Setu sits relative to forecasting: the Geological Survey of India has issued operational and experimental landslide forecast bulletins since the 2025 monsoon for 21 districts, Rudraprayag among them. Setu does not compete with that. It starts where a forecast ends and asks what the consequences are for access and care if the roads fail. A 2025 conference abstract on Rudraprayag also reports that most of the 196 confirmed landslides it mapped (2019 to 2023) were concentrated near road networks, which is why S1 models road-segment landslides. This is a single study; treat it as supporting context, not proof.

## 3. Primary user and decision

**User:** a district disaster control room officer (DDMA / SDRF level).
**Decision:** given an event or forecast, which villages will be cut off, for how long, which have no reachable clinic, and where to pre-position ambulances, medicines, and rations.

Secondary audience: hackathon judges and the public, via the same interface with guided scenarios.

## 4. Scope

### In scope (v1)

- One valley corridor of roughly 20–30 km on real terrain, roads, villages, and health facilities
- Scenario S1 (landslide on a road segment) and the consequences dashboard
- Tap-to-trigger interaction, playback timeline, before/after comparison
- Simulated people moving by scenario-specific rules, driven by the network model
- LLM-written situation brief from computed metrics
- Assumptions and data-provenance panel
- Exportable after-action report (PDF or printable page)

### Stretch

- Scenario S2 (flash flood at a point)
- Hindi output for the brief and UI strings
- Scenario S3 (medical emergency under closure)

### Out of scope

- Real-time data feeds, live alerts, or anything presented as a warning
- Forecasting rainfall or predicting where landslides will occur
- Whole-district or state-wide coverage
- User accounts, persistence, or collecting personal data
- Mobile-native apps (the web app must work on mobile, but is designed for desktop)

## 5. Scenarios

Every scenario run is a pure function of `(corridor data, scenario params, seed)`. The same inputs always give the same output.

### S1 — Landslide on a road segment (v1)

- **Trigger:** user selects a road segment on the map.
- **Params:** severity (minor, major, severe), which sets blockage extent and clearance time.
- **Effect:** the segment is closed until its clearance time. Adjacent segments may get a speed penalty (debris, caution).
- **Behaviour:**
  - People in villages whose only access ran through the segment start moving toward the nearest reachable clinic. If none is reachable they wait at the village access point.
  - An ambulance dispatched from the nearest facility follows the shortest surviving path and stops at the block.
  - Villages with a surviving alternative route reroute.
- **Outputs:** isolation timeline, access-time changes, affected population, clearance estimate.

### S2 — Flash flood at a point (stretch)

- **Trigger:** user selects a point near a river.
- **Params:** severity (sets flooded radius along the river).
- **Effect:** bridges and low-lying road segments within the radius close. Buildings in the radius are marked affected.
- **Behaviour:** residents move uphill to the nearest safe point (higher elevation, off the flooded zone). Same ambulance and rerouting rules as S1.

### S3 — Medical emergency under closure (stretch)

- **Trigger:** user selects a village while a closure is active.
- **Output:** a patient route attempt, time to reach care, and whether the golden-hour threshold is breached.

## 6. Metrics (precise definitions)

Facilities count as destinations by **tier** (see `docs/DATA.md` and ADR-008). Metrics are reported separately for two target sets: `primary` (PHC and above) and `emergency` (CHC, trauma centre, and district hospital only). Sub-centres, private clinics, and restricted-access facilities (for example ITBP and ECHS) are never counted as emergency destinations. Let `F_open` be the set of facilities of the target tier reachable in the surviving network, and `T(v, f)` the shortest travel time from village `v` to facility `f`.

| Metric | Definition | Unit |
|---|---|---|
| `access_time(v)` | `min over f in F_open of T(v, f)`, infinite if none | minutes |
| `isolated(v)` | `access_time(v)` is infinite | boolean |
| `delayed(v)` | `access_time(v)` exceeds `T_golden` | boolean |
| `population_isolated` | sum of village population where `isolated(v)` | people |
| `population_delayed` | sum of village population where `delayed(v)` and not isolated | people |
| `access_delta(v)` | `access_time_after(v) - access_time_before(v)` | minutes |
| `clearance_time` | estimated time until the blocked segment reopens | hours |
| `isolation_duration(v)` | clearance time of the last blocked segment on which `v` still depends, along its best-case path | hours |

**Event attribution (implemented in M3).** Metrics describe what the event changes, so three kinds of place are reported separately and never blamed on the event:

- `unconnected`: the place could not be attached to any road within the snap distance (a data gap).
- `no_baseline`: the place has no route to any destination even before the event (a data gap or a disconnected piece of network).
- Everything else is judged against its own "before": `isolated` means reachable before and unreachable after; `delayed` means reachable but beyond the threshold after; `newly_delayed` is delayed after and within the threshold before.

`population_isolated` and `population_delayed` sum only places with a known population, and the result reports what share of isolated places that covers (`known_share_isolated`). While no population data is loaded the share is zero and the UI must say "population unknown" rather than show zero.

`T_golden` default is 60 minutes. It is an assumption, labelled in the UI, and user-adjustable.

Village population: Census-linked or PMGSY habitation data. OSM buildings are too sparse in the corridor to estimate population (2026-10-22 audit), so there is no building-count fallback. If a village has no usable population figure, it is shown as "population unknown" and excluded from population totals, and the UI says so. Census figures date from 2011 and are labelled as such.

Every metric shown in the UI carries a unit and either a data-source tag or an assumption tag.

## 7. UX

### Layout

- Main viewport: 3D terrain with roads, villages, facilities
- Left rail: scenario picker, parameters, run controls
- Right panel: dashboard (metrics, ranked affected villages, before/after toggle)
- Bottom: timeline scrubber with play, pause, speed
- Panel: Assumptions and data sources (always reachable)
- Brief: "Generate brief" action producing the LLM brief, shown beside the dashboard

### Core flow

1. Choose a scenario.
2. Tap the map to place the event. Invalid targets give a clear message (for example, "select a road segment").
3. Set severity, then Run.
4. Watch the event play out on the timeline. People and ambulances move.
5. Read the dashboard. Toggle before/after to see what changed.
6. Generate the brief. Export the report.

### Population

The top bar always shows how many people live in the corridor and, once a scenario runs, how many that scenario cuts off, with the share of the corridor. Population comes from a gridded dataset (WorldPop 2020) shared out to villages by proximity, so every figure is a modelled estimate: shown with an approximate sign, rounded (nearest 10, 100 or 1,000 depending on size), and tagged as an estimate. People living off any drivable road, or in places with no route to care even before an event, cannot be analysed; the bar says how many they are. If no population has been loaded the bar says so and says how to load it, and never shows zero.

### News

A card in the left rail lists recent headlines about the area, each with its publisher's picture, source and age, and a filter (All, Local, Roads, Weather, Health). A headline counts as Local when it names a place in the corridor; a headline about Uttarakhand as a whole appears only if it is also about roads, weather or health. Headlines are found through the GDELT Project, kept if relevant, de-duplicated, and written to a file by a scheduled job every three hours; the page re-reads that file every 15 minutes and on Refresh. Headlines and images belong to their publishers and link to them.

### Report

The dashboard has an "Open report" button. It opens a printable page for the current scenario in a new tab, to print or save as PDF with Ctrl+P. The report holds: a picture of the map as it is now, the scenario and its assumed values, the before and after results with each number tagged as data or assumption, the most affected places, the situation brief if one has been written (labelled AI or template, and where it ran), every assumption, every data source with its known gaps, the "not an operational warning system" notice, and the run record (simulator version, seed, inputs), so the same results can be reproduced. If a pop-up blocker stops the new tab, the page downloads as an HTML file instead.

### Interaction rules

- Camera: orbit with constrained pitch and zoom. Reset-view control always visible.
- Selection feedback: hover highlight and snap to the nearest valid target of the chosen scenario.
- Motion respects `prefers-reduced-motion` (no camera fly-throughs; playback still works).
- Colour is never the only carrier of meaning. Colour-blind-safe palette.

## 8. LLM brief contract

The LLM narrates; it does not compute. Implemented in `web/src/brief/` (M6).

**Input** (JSON, built from the finished run by `buildBriefInput`; exact shape in `web/src/brief/types.ts`):

- `language`: `"en"` or `"hi"`
- `scenario`: severity, road name and class, length, assumed reopening time, destination set, delay threshold
- `metrics`: a keyed map, each `{ value | null, unit, tag: "data" | "assumption", label }`. Keys: `cut_off_places`, `delayed_places_before`, `delayed_places_after`, `typical_access_min_before`, `typical_access_min_after`, `people_cut_off`, and, when access is restored, `restored_after_h_min` and `restored_after_h_max`. A `null` value means unknown and must be described as unknown.
- `top_affected`: up to five places with status (`cut_off` or `delayed`) and minutes before and after
- `data_gaps`: places off any drivable road, places with no route before the event
- `assumptions`: the few modelled values that matter here

**Output** (JSON, validated on the server and again in the browser):

```
{
  summary: string,
  key_risks: string[],
  recommended_actions: [ { action, rationale, metric_refs: string[] } ],
  caveats: string[]
}
```

Rules:

- The model may only use numbers present in the input (including digits inside names such as "NH107"), copied exactly or rounded to a whole number or one decimal. Anything calculated, such as a sum, difference or percentage, is rejected. Numbers written in Devanagari digits are checked the same way.
- `metric_refs` must point to keys in `metrics`, and every action must cite at least one.
- Output always includes a caveat that this is a simulation using assumed values.
- Place and road names from open map data are treated as data, not instructions: control characters are stripped and length is capped before they reach the model.
- On a failed check the server asks the model once more, listing exactly what was wrong. After two failures it returns an error.
- **Fallback:** if the AI service is missing, unreachable or fails the check, the interface shows a rule-based template brief built from the same numbers (and validated by the same code), clearly labelled "Template summary, not AI", with the reason. This replaces the earlier idea of pre-generated briefs, which would go stale whenever an assumption changed. The template is English only.
- **Two providers, same checks.** The brief is written either by a local model through Ollama (the default, no key and no data leaves the computer) or by the Claude API. With nothing configured it tries Ollama, using `qwen3.5:4b`. `BRIEF_PROVIDER`, `OLLAMA_MODEL`, `OLLAMA_URL`, `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` change that. Whichever writes it, the answer goes through the same validation, retry and fallback.
- **Ollama request:** `POST /api/chat` with `stream: false`, `think: false`, a JSON-schema `format` (so the shape is enforced while the model writes, and `metric_refs` can only be keys that exist in the input), low temperature, and a fixed context size. The prompt gives a small model a worked example and an explicit list of the numbers it may write.
- **Claude request:** no `temperature`, no assistant prefill, no forced tool choice and no thinking settings, because the current models reject them. The default model is `claude-haiku-5-5`. `max_tokens` is generous because thinking shares it with the reply.
- The brief is marked "Local AI only" in the interface. When the model cannot be reached the interface says so plainly and shows the labelled template: on a computer where Ollama is not running it says to start it; on a hosted copy it says there is no local model.
- A hosted copy of the app cannot reach a model running on someone's own computer. For a public demo link, either run it locally, use the Claude API with a spending limit, or accept the labelled template fallback.

## 9. Honesty requirements

- Provenance panel lists each dataset, source, licence, and date retrieved.
- Assumptions panel lists each modelled constant, its value, and its basis.
- A persistent notice states the simulator is illustrative and not an operational warning system.
- Where data is thin (for example, missing road segments patched by hand), the panel says so.

## 10. Non-functional targets

These are targets to confirm on the reference machine, not guarantees.

- 30 fps or better with 300 agents on integrated graphics
- Initial interactive view in under 5 seconds on broadband, with terrain streamed progressively
- Initial transfer of 20 MB or less before first interaction
- Simulation run for one scenario completes in under 2 seconds on the reference machine
- Keyboard-operable controls, visible focus states, labelled form controls
- English first; all user-facing strings go through an i18n layer so Hindi can be added without refactoring

## 11. Acceptance criteria — v1

- [ ] Corridor renders as real terrain with real roads, villages, and facilities
- [ ] Tapping a road and running S1 produces a deterministic result (same seed, same output)
- [ ] Dashboard shows all metrics in section 6 with units and tags
- [ ] Before/after toggle changes the map and the numbers
- [ ] People and an ambulance move per the S1 rules; stationary waiting is visible
- [ ] Assumptions panel and provenance panel are complete and reachable from every screen
- [ ] LLM brief passes schema validation; fallback brief works with the network disabled
- [ ] Export produces a readable after-action report
- [ ] Meets targets in section 10 on the reference machine
- [ ] No placeholder UI, no unlabelled modelled numbers

## 12. Open questions

- Which corridor exactly (see ADR-006)?
- Is village-level population available at usable resolution, or do we estimate from buildings?
- Do clinic locations come from OSM, an official facility list, or both?
- Does the official submission require a working prototype, or only the idea text? (Check the official timeline.)
- Which licence for the repo?
- Define the reference machine for the performance targets (proposed: a mid-range laptop with integrated graphics, similar to what judges are likely to use)

## Sources

- GSI landslide forecasting and susceptibility data, Ministry of Earth Sciences reply: https://moes.gov.in/sites/default/files/PIB2158420.pdf
- EGU General Assembly 2025 abstract EGU25-4637, "Time stamped landslide inventory and its causal factors in Rudraprayag, India": https://meetingorganizer.copernicus.org/EGU25/EGU25-4637.html
- The Hitavada, "16 killed in rain-related incidents as monsoon batters nation", 20 Jul 2026: https://www.thehitavada.com/Encyc/2026/7/20/16-killed-in-rain-related-incidents-16-as-monsoon-batters-nation.html
- Medical Dialogues, "Uttarakhand: only 295 specialist doctors against 840 sanctioned posts, RTI reveals": https://medicaldialogues.in/state-news/uttrakhand/uttarakhand-only-295-specialist-doctors-against-840-sanctioned-posts-rti-reveals-180910
