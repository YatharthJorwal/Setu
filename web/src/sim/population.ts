import type { PopulationSource, RoadGraph } from './graph';
import { facilityNodes } from './metrics';
import { accessTimes } from './routing';

export interface PopulationSummary {
  /** people in all places that have a population figure */
  total: number;
  placesWithData: number;
  placesTotal: number;
  /** people in places the model can analyse: on a drivable road, with a route to emergency care before any event */
  analysed: number;
  /** total minus analysed: people the scenarios cannot say anything about */
  notAnalysed: number;
  source: PopulationSource | null;
}

/** How many people live in the corridor, and how many of them the model can actually analyse. Computed once. */
export function populationSummary(graph: RoadGraph): PopulationSummary {
  const baseline = accessTimes(graph, facilityNodes(graph, 'emergency'), null).dist_s;
  let total = 0;
  let analysed = 0;
  let withData = 0;
  for (const p of graph.places) {
    if (p.population === null) continue;
    withData++;
    total += p.population;
    if (p.node !== null && Number.isFinite(baseline[p.node])) analysed += p.population;
  }
  return {
    total,
    placesWithData: withData,
    placesTotal: graph.places.length,
    analysed,
    notAnalysed: total - analysed,
    source: graph.populationSource,
  };
}
