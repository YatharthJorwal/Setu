import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRoadGraph, parseGraph } from './graph';
import { describeNetwork } from './report';
import { runScenario } from './run';

// Runs on the real corridor if `python -m pipeline.build_graph` has produced graph.json.
// Prints a network report and the most critical road segments so the numbers can be inspected.
const path = resolve(__dirname, '../../../data/processed/graph.json');

describe.skipIf(!existsSync(path))('real corridor graph', () => {
  const graph = buildRoadGraph(parseGraph(JSON.parse(readFileSync(path, 'utf-8'))));

  it('loads and describes the network', () => {
    const report = describeNetwork(graph);
    console.log('NETWORK REPORT\n' + JSON.stringify(report, null, 2));
    expect(report.edges).toBeGreaterThan(0);
    expect(report.places.total).toBeGreaterThan(0);
  });

  it('runs a landslide on the most critical segment and respects basic invariants', () => {
    const top = describeNetwork(graph).mostCriticalEmergency[0];
    const r = runScenario(graph, { type: 'landslide', edge: top.edge, severity: 'major' });
    const m = r.snapshots[0].emergency;
    console.log(
      `LANDSLIDE on edge ${top.edge} "${top.name}" (${top.className}), major: ` +
        `${m.places_isolated} places cut off, ${m.places_newly_delayed} newly delayed, ` +
        `${m.places_no_baseline} had no route to start with, ${m.places_unconnected} not on any road`,
    );
    expect(m.places_isolated).toBeGreaterThanOrEqual(0);
    expect(r.snapshots[r.snapshots.length - 1].emergency.places_isolated).toBe(0);
    const again = runScenario(graph, { type: 'landslide', edge: top.edge, severity: 'major' });
    expect(again).toEqual(r);
  });
});
