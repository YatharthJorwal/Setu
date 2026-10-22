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
- Show a before/after comparison and a consequences dashboard
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

Not yet. Setup and run instructions will be added when the scaffold lands. Environment variables will be documented here; secrets are never committed.

## Data and attribution

Map data © OpenStreetMap contributors (ODbL). Other sources and their licences are listed in [`docs/DATA.md`](docs/DATA.md) and will be shown in the app.

## Licence

To be decided.
