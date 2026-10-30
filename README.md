# Setu

**सेतु, "bridge".** A 3D decision-support simulator that shows which Himalayan villages get cut off when roads fail, how far the nearest working clinic becomes, and what to pre-position before the roads go.

Built on real terrain and real roads for a valley corridor in Uttarakhand. Tap a road, trigger a landslide, and watch the network break.

> **Status:** working prototype for one real corridor (Rudraprayag, Uttarakhand), built for the SCERT Uttarakhand Hackathon 3.0.
>
> **Live site:** https://yatharthjorwal.github.io/Setu/ (the AI-written brief needs a local model and is shown as a labelled template on the hosted copy)

> **Disclaimer:** Setu is an illustrative simulator. It is not an operational warning system, does not forecast events, and is not affiliated with any government body. Modelled values are labelled as assumptions in the app.

## What it does today

- Render a real Uttarakhand valley corridor in 3D (terrain, roads, villages, health facilities)
- Let you trigger a landslide by tapping a road, with a chosen severity
- Re-route every village over the surviving road network and rank the single most critical road segments
- Compute, per village: access time to the nearest working clinic, whether it is isolated, how long, and how many people are affected
- Show a before/after comparison, a timeline, and a consequences dashboard
- Generate a plain-language situation brief from the computed numbers (an LLM narrates; it never computes)
- Show every dataset, licence, and modelled assumption in-app
- Open a printable report of any scenario, to print or save as PDF
- Show a modelled population estimate (WorldPop 2020); a local-news card is available when running locally

## Not built yet

- A flash-flood scenario
- People and ambulances moving across the network (agents)
- Curated facility tiers: all 71 facilities are still name-based guesses (see `docs/DECISIONS.md` ADR-008)
- Validation of travel speeds and clearance times with local officials

## Documents

| Doc | Contents |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Working agreement for contributors and AI assistants |
| [`docs/SPEC.md`](docs/SPEC.md) | Product spec: scenarios, metrics, UX, acceptance criteria |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design, simulation model, data flow |
| [`docs/RULES.md`](docs/RULES.md) | Product, code, data, git, and design rules |
| [`docs/DATA.md`](docs/DATA.md) | Datasets, schemas, audit checklist, attribution |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Decision log |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Milestones, priorities, cut list |
| [`docs/IDEA_DRAFT.md`](docs/IDEA_DRAFT.md) | Draft hackathon submission text |

## Stack

React, TypeScript (strict), Vite, react-three-fiber / three.js, Zustand, a Web Worker for the simulation, a Python offline data pipeline, and a small serverless function for the LLM brief.

## Repository layout

```
docs/        project documents
data/        raw (gitignored) and processed data
pipeline/    Python data pipeline
server/      serverless LLM brief proxy
web/         the React app (sim core in web/src/sim)
```

## Running it

Needs Python 3.11+ and Node 20+. From the repo root:

```
pip install -r pipeline/requirements.txt
python -m pipeline.fetch_osm --area rudraprayag
python -m pipeline.fetch_dem --area rudraprayag
python -m pipeline.build --area rudraprayag
python -m pipeline.build_graph --area rudraprayag
cd web
npm install
npm run dev
```

Then open the address Vite prints (usually http://localhost:5173). Secrets are never committed.

The situation brief is written by a language model and every figure is checked against the simulation. By default it uses a local model through [Ollama](https://ollama.com) (`ollama pull qwen3.5:4b`), so no key is needed and nothing leaves your computer. To use the Claude API instead, copy `web/.env.example` to `web/.env.local` and set `ANTHROPIC_API_KEY`; the key stays on the server side and is never committed. If no model is available the app still works and shows a rule-based template brief, labelled as such.

Work in one folder only. Copies of this repo unpacked elsewhere (for example in Downloads) are stale and must not be committed from. `run.bat info` shows which folder you are in and whether it is up to date; `run.bat save "message"` commits and pushes from the right place.

### Population and news

```
run.bat population      # estimates people per village from WorldPop (reads only the corridor), then rebuilds the graph
run.bat news            # optional, local only: fetches local headlines for the news card (slow; GDELT often rate-limits)
```

The top bar shows how many people live in the corridor and how many the current scenario cuts off. These are modelled estimates, labelled as such. The news card is shown only when running locally; the hosted site does not carry news.

### Hosting on GitHub Pages

1. In the repository: Settings > Pages > Build and deployment > Source: **GitHub Actions**.
2. Commit the processed map files (`data/processed`, including `graph.json`) and `web/package-lock.json`: the build needs them.
3. Push to `main`. The workflow in `.github/workflows/pages.yml` builds the site and publishes it at `https://<your-user>.github.io/Setu/`. It can also be started from the Actions tab.

The AI situation brief runs only on a local model, so on the hosted site it shows the labelled rule-based summary.

On Windows, `run.bat` does all of this in one step (installing packages, fetching and building data if missing, then starting the app). `run.bat help` lists the other commands.

## Data and attribution

Map data © OpenStreetMap contributors (ODbL). Other sources and their licences are listed in [`docs/DATA.md`](docs/DATA.md) and will be shown in the app.

## Licence

To be decided.
