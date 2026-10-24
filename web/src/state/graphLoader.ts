import { buildRoadGraph, parseGraph, type RoadGraph } from './sim-api';

/** Loads graph.json. Throws a readable error if it is missing or invalid. */
export async function loadGraph(baseUrl: string): Promise<RoadGraph> {
  const url = `${baseUrl.replace(/\/$/, '')}/graph.json`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`Network error fetching ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}. Build it with run.bat graph.`);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error(`${url} is not valid JSON.`);
  }
  return buildRoadGraph(parseGraph(json));
}
