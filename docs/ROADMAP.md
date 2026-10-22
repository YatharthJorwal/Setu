# ROADMAP — Setu

Status: draft v0.1. Written Thursday 22 Oct 2026. Deadline for the hackathon idea submission: Saturday 31 Oct 2026. That leaves 9 days including today, so the plan is tight.

Confirm the official timeline on the hackathon portal. Whether a working prototype is needed at submission, or only after shortlisting, was not confirmed when this was written. The plan below protects the idea submission first and builds the prototype in parallel.

## Milestones

| Date | Milestone | Done when |
|---|---|---|
| Thu 22 Oct | **M0: Repo and docs** | Docs and scaffold pushed to GitHub. Docs written; push is the author's step. |
| Thu 22 to Fri 23 Oct | **M1: Data audit** | Checklist in `docs/DATA.md` complete; corridor confirmed (ADR-006); idea text drafted. Status 22 Oct: desk audit done, audit scripts written and tested on synthetic data, idea draft written. Remaining: run the local audit on real files and confirm the corridor. |
| Sat 24 Oct | **M2: Terrain and roads on screen** | Real terrain with road overlay renders at an acceptable frame rate |
| Sun 25 Oct | **M3: Core engine** | Graph, routing, S1 landslide, isolation metrics, with tests; deterministic runs |
| Mon 26 Oct | **M4: Tap-to-trigger and dashboard** | Tap a road, run S1, see metrics with units and tags, before/after toggle |
| Tue 27 Oct | **Submit the idea** | Idea text final and submitted on the portal; screenshots or a short capture attached if allowed |
| Tue 27 Oct | **M5: Agents** | People and an ambulance move per S1 rules |
| Wed 28 Oct | **M6: LLM brief** | `/api/brief` with schema and number validation; fallback brief working |
| Thu 29 Oct | **M7: Honesty layer and polish** | Assumptions and provenance panels; performance pass; report export |
| Fri 30 Oct | **M8: Demo and write-up** | Demo video, README with screenshots, a bug bash |
| Sat 31 Oct | Buffer | Nothing new. Fixes only. |

## Order of priority if time runs short

Protect, in order:

1. The idea submission, on time
2. M1 to M4 (real terrain, S1, dashboard): the core claim
3. M6 (LLM brief with validation)
4. M7 (honesty layer)
5. M5 (agents)

## Cut list (cut in this order)

1. S2 flash flood (already stretch)
2. Hindi output
3. S3 medical emergency
4. Export to PDF (keep a printable page)
5. Agent variety (keep one resident behaviour plus the ambulance)

Do not cut: determinism, units and tags, the assumptions panel, or the not-an-operational-system notice. These are what make it credible.

## Risks

| Risk | Impact | Response |
|---|---|---|
| Hill road or facility data too thin | M1 slips; everything shifts | Decide on day 1. Hand-patch the corridor or switch corridors (new ADR). |
| Terrain too heavy for judges' laptops | Poor demo | Chunked tiles, test on a modest machine early (M2) |
| LLM output invents figures | Loss of credibility | Schema plus number check; pre-generated fallback |
| Submission needs something not anticipated | Missed deadline | Read the portal's submission form on day 1 |
| Time | Unfinished prototype | Follow the priority order and cut list above |

## After the hackathon

Not planned in detail. Likely directions: a second corridor, real-time rainfall input, flash-flood scenario, field validation of the assumptions table with local officials.
