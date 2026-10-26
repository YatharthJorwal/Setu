# Setu

**सेतु, "bridge".** A 3D decision-support simulator that shows which Himalayan villages get cut off when roads fail, how far the nearest working clinic becomes, and what to pre-position before the roads go.

Built on real terrain and real roads for a valley corridor in Uttarakhand. Tap a road, trigger a landslide, and watch the network break.

> **Status:** pre-alpha. This repository currently holds the project documents and an empty scaffold. Built for the SCERT Uttarakhand Hackathon 3.0.

> **Disclaimer:** Setu is an illustrative simulator. It is not an operational warning system, does not forecast events, and is not affiliated with any government body. Modelled values are labelled as assumptions in the app.

## What it will do

- Render a real Uttarakhand valley corridor in 3D (terrain, roads, villages, health facilities)
- Let you trigger a scenario by tapping the map: a landslide on a road segment (v1); a flash flood at a point (stretch)
- Simulate people and ambulances moving across the surviving road network
- Compute, per village: access time to the nearest working clinic, whether it is isolated, how long, and how many people are affected
- Show a before/after comparison, a timeline, and a consequences dashboard
- Generate a plain-language situation brief from the computed numbers (an LLM narrates; it never computes)
- Show every dataset, licence, and modelled assumption in-app

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

On Windows, `run.bat` does all of this in one step (installing packages, fetching and building data if missing, then starting the app). `run.bat help` lists the other commands.

## Data and attribution

Map data © OpenStreetMap contributors (ODbL). Other sources and their licences are listed in [`docs/DATA.md`](docs/DATA.md) and will be shown in the app.

## Licence

To be decided.
