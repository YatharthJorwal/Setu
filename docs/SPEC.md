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

Let `F_open` be the set of health facilities reachable in the surviving network, and `T(v, f)` the shortest travel time from village `v` to facility `f`.

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

`T_golden` default is 60 minutes. It is an assumption, labelled in the UI, and user-adjustable.

Village population: Census or building-count estimate, whichever the data audit confirms. If estimated, the UI states the method and persons-per-household assumption.

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

### Interaction rules

- Camera: orbit with constrained pitch and zoom. Reset-view control always visible.
- Selection feedback: hover highlight and snap to the nearest valid target of the chosen scenario.
- Motion respects `prefers-reduced-motion` (no camera fly-throughs; playback still works).
- Colour is never the only carrier of meaning. Colour-blind-safe palette.

## 8. LLM brief contract

The LLM narrates; it does not compute.

**Input** (JSON, built by the app from simulation output):

```
{
  scenario: { type, severity, location_label, seed },
  metrics: { key: { value, unit, tag: "data" | "assumption" } },
  top_affected: [ { village, population, access_time_before_min, access_time_after_min } ],
  assumptions: [ { key, value, note } ],
  language: "en" | "hi"
}
```

**Output** (JSON, validated server-side with a schema):

```
{
  summary: string,
  key_risks: string[],
  recommended_actions: [ { action, rationale, metric_refs: string[] } ],
  caveats: string[]
}
```

Rules:

- The model may only reference numbers present in the input. The server rejects output containing numbers not in the input.
- `metric_refs` must point to keys in `metrics`.
- Output always includes caveats stating that this is a simulation using the listed assumptions.
- If the call fails or validation fails, show a precomputed fallback brief for the guided scenarios, clearly marked as pre-generated.

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

- The Hitavada, "16 killed in rain-related incidents as monsoon batters nation", 20 Jul 2026: https://www.thehitavada.com/Encyc/2026/7/20/16-killed-in-rain-related-incidents-16-as-monsoon-batters-nation.html
- Medical Dialogues, "Uttarakhand: only 295 specialist doctors against 840 sanctioned posts, RTI reveals": https://medicaldialogues.in/state-news/uttrakhand/uttarakhand-only-295-specialist-doctors-against-840-sanctioned-posts-rti-reveals-180910
