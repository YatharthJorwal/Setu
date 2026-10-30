# IDEA DRAFT — Setu (hackathon submission text)

Status: draft v0.2, 2026-10-26. Four lengths below, so whichever the portal's form allows can be pasted. Adjust to the form's actual fields and limits. Every claim here matches what the prototype does today. The figures come from the prototype running on open data and **have not been checked with officials**; keep the caveats.

**Before submitting:** re-verify the two public statistics against their original sources (84 roads blocked in July 2026; 295 specialist doctors against 840 sanctioned posts). Attach two or three screenshots if the form allows.

---

## Title

Setu: when the road closes, who gets cut off?

## Length 1: one sentence (about 30 words)

A 3D simulator on real Uttarakhand terrain that shows which villages lose their road route to emergency care when a landslide closes a road, and what to pre-position before it happens.

## Length 2: short (about 110 words)

Hill roads in Uttarakhand fail every monsoon, and health services in the hills are thin, so a closed road is a health emergency. Setu models a real valley corridor in Rudraprayag as a road network on real terrain. Click a road, choose a landslide severity, and Setu shows which villages lose their route to a CHC, trauma centre or district hospital, how long access takes before and after, and when it returns. A local AI model writes a plain-language brief from the numbers, and every figure in it is checked against the simulation. In the prototype, closing the first stretch of NH107 out of Rudraprayag cuts 142 mapped places off from emergency care.

## Length 3: medium (about 250 words)

**Problem.** Uttarakhand's hill roads fail every monsoon: in July 2026 landslides blocked 84 roads across districts under red and orange alerts. Health services in the hills are thin: an RTI-based report found 295 specialist doctors against 840 sanctioned posts. A blocked road is therefore also a health-access event, yet existing tools show hazard risk or a list of closures, not what an isolated village loses.

**Solution.** Setu turns open data (OpenStreetMap roads and health facilities, a Copernicus terrain model) into a 3D model of a real valley corridor in Rudraprayag. A district control room officer clicks any road, picks a severity, and sees which villages are cut off from emergency care, which are pushed past a delay threshold, and when access returns. A before-and-after view and a timeline show exactly what the closure changed. A one-click printable report records the scenario, assumptions, data sources and run record.

**AI.** A language model, running locally through Ollama so no data leaves the computer, writes a short situation brief in English or Hindi. It may only narrate numbers the simulation produced: any figure not in the simulation output is rejected, and if the model cannot comply a clearly labelled rule-based summary is shown instead.

**Honesty.** Speeds and clearance times are labelled assumptions. The prototype is an illustrative simulator, not a warning system.

## Length 4: full

### The problem

Uttarakhand's hill roads fail every monsoon. In July 2026, landslides blocked 84 roads, including two national highways, across districts under red and orange alerts. Health services in the hills are thin: an RTI-based report found 295 specialist doctors working against 840 sanctioned posts. A blocked road is therefore also a health-access event. Existing tools mostly show landslide risk or list closed roads. They do not show what an isolated village loses.

### The solution

Setu models a real valley corridor (Rudraprayag district, the Mandakini and Alaknanda valleys) as a road network on real terrain. The model currently holds about 1,300 road segments, 789 villages and hamlets, and 71 mapped health facilities, all from open data.

A district control room officer picks a landslide scenario and clicks a road. The road closes until an assumed clearance time and, for worse slides, neighbouring roads slow down. Setu then shows, for every village: whether it can still reach a CHC, trauma centre or district hospital, how many minutes that takes before and after, whether it is pushed beyond a delay threshold, and when access returns. A before-and-after switch and a timeline show exactly what the closure changed. Setu can also rank the single road segments the corridor depends on most.

In the prototype, closing the first stretch of NH107 out of Rudraprayag leaves 142 mapped villages and hamlets with no route to emergency care. Under the current assumptions a typical village is already about 79 minutes from such a facility. These figures depend on assumed speeds and on facility tiers guessed from names, and have not been verified with officials.

### How technology and AI are used

- Network analysis on real roads and terrain: closures change the road graph, and shortest-path routing from every qualifying facility gives access times for all villages. This is deterministic and tested.
- Real-terrain 3D visualisation (WebGL), so officers and communities can see why a valley is vulnerable.
- A population bar that always shows how many people live in the corridor and how many the chosen closure cuts off (a modelled WorldPop estimate, labelled as such), and a live, filterable feed of local news with pictures, refreshed automatically.
- A language model writes a plain-language situation brief in English or Hindi from the computed numbers. It runs locally through Ollama, so nothing leaves the computer and no paid service is needed. It never calculates or invents figures: a validation step rejects any number that is not in the simulation output, asks the model to correct itself once, and otherwise shows a clearly labelled rule-based summary.
- A one-click printable report records the scenario, results, brief, assumptions, data sources, known gaps, and the inputs needed to reproduce the run.

### Expected impact

- Gives planners a concrete answer to "who is cut off, and for how long" before the event rather than after.
- Makes the link between road failure and health access visible to decision makers and the public.
- Supports pre-positioning of ambulances, medicines and rations where isolation is worst.

### Feasibility

Built on open data and a working prototype: terrain from Copernicus GLO-30, roads and facilities from OpenStreetMap, village and facility data checked against government open datasets (PMGSY). Data gaps in the hills are disclosed in the app, not hidden. The prototype covers one corridor and one fully worked scenario (landslide on a road segment); a flash-flood scenario is the next step.

### Scalability

A data pipeline turns any corridor's open data into the same set of validated files, so a new valley is a data build, not a rewrite. The same engine could take rainfall forecasts or the Geological Survey of India's landslide forecast bulletins (issued for Rudraprayag since the 2025 monsoon) as inputs.

### Honest limits

Travel speeds and clearance times are assumptions, labelled as such everywhere in the app, to be validated with local officials. Village population is not yet loaded, so the app says "unknown" rather than guess. Facility tiers are inferred from names and need curating. About 30% of mapped places are not on any drivable road in OpenStreetMap and are reported separately, never blamed on an event. Setu is an illustrative simulator, not an operational warning system.

## Open items before submitting

- [ ] Match to the portal's fields and length limits
- [ ] Re-check the two public statistics against their original sources
- [ ] Add two or three screenshots if the form allows attachments
- [ ] Run the population step first, then quote the cut-off population as "about N people (modelled estimate)"
- [ ] Say whether the numbers for NH107 should be kept, or removed until the facility tiers are curated
