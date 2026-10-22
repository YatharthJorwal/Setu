# IDEA DRAFT — Setu (hackathon submission text)

Status: draft v0.1, 2026-10-22. Adjust to the portal's actual form fields and any length limits before submitting. Claims below must match what is built or clearly planned; do not add claims the prototype cannot show. Re-verify the two statistics against their original sources first.

---

## Title

Setu: when the road closes, who gets cut off?

## One-line summary

A 3D simulator on real Uttarakhand terrain that shows which villages lose road access when a landslide or flood hits, how far the nearest working clinic becomes, and what to pre-position before the roads fail.

## The problem

Uttarakhand's hill roads fail every monsoon. In July 2026, landslides blocked 84 roads, including two national highways, across districts under red and orange alerts. Health services in the hills are thin: an RTI-based report found 295 specialist doctors working against 840 sanctioned posts. A blocked road is therefore also a health-access event. Existing tools mostly show landslide risk or list closed roads. They do not show what an isolated village loses.

## The solution

Setu models a real valley corridor (a Rudraprayag stretch, to be confirmed) as a road network on real terrain. A user picks a scenario, taps a road, and watches the event play out: the segment closes, people and ambulances re-route or wait, and the dashboard computes, for every village, the time to the nearest working clinic, whether it is isolated, for how long, and how many people are affected. A before/after view shows exactly what the closure changed.

The intended user is a district control room officer deciding what to pre-position (ambulances, medicines, rations) before a forecast event. It is a planning and discussion tool, not an operational warning system.

## How technology and AI are used

- Network analysis on real roads and terrain: closures change the road graph, and shortest-path routing from every open health facility gives access times for all villages. This is deterministic and testable.
- Real-terrain 3D visualisation (WebGL) so that officers and communities can see why a valley is vulnerable.
- Simulated people and ambulances following scenario-specific behaviour on the surviving network.
- A language model writes a plain-language situation brief in English and Hindi from the computed numbers. It never calculates or invents figures: a validation step rejects any number that is not in the simulation output.

## Expected impact

- Gives planners a concrete answer to "who is cut off and for how long" before the event rather than after.
- Makes the link between road failure and health access visible to decision makers and the public.
- Supports pre-positioning of scarce resources where isolation and clinic distance are worst.

## Feasibility

Built on open data: a public elevation model (Copernicus GLO-30), OpenStreetMap roads, and village and facility data from government open datasets (PMGSY, Census-linked village layers). Data gaps in the hills will be patched explicitly and disclosed in the app. The prototype covers one corridor and one fully worked scenario (landslide on a road segment); a flash-flood scenario is a stretch goal.

## Scalability

The pipeline turns any corridor's open data into the same set of validated files, so a new valley is a data build rather than a rewrite. The same engine could take rainfall forecasts or landslide forecast bulletins (the Geological Survey of India has issued these for Rudraprayag since the 2025 monsoon) as inputs.

## Prototype and honesty about limits

A working 3D prototype with the landslide scenario, the consequences dashboard, a before/after view, and an assumptions panel that lists every modelled value and data source. Modelled values (travel speeds, clearance times, the clinic-access threshold) are labelled as assumptions and will be validated with local officials in a next phase. Village population uses 2011 Census figures, which are dated.

## Open items before submitting

- [ ] Confirm the corridor after the local data audit
- [ ] Check the two statistics against their original sources
- [ ] Match to the portal's fields and length limits
- [ ] Add a short screen capture or screenshots if the form allows attachments
