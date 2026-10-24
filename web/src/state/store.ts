import { create } from 'zustand';
import { loadAssets, type Assets } from '../lib/assets';
import type { Facility } from '../lib/types';
import { loadGraph } from './graphLoader';
import {
  T_GOLDEN_MIN_DEFAULT,
  rankCriticalEdges,
  runScenario,
  type CriticalEdge,
  type RoadGraph,
  type RunResult,
  type Severity,
  type TargetSet,
} from './sim-api';

export type LayerKey = 'roads' | 'facilities' | 'places';
export type MapView = 'before' | 'after';
type Status = 'idle' | 'loading' | 'ready' | 'error';

export interface ScenarioSettings {
  /** the road segment that is hit, or null before the first click */
  edge: number | null;
  severity: Severity;
  tGoldenMin: number;
  targetSet: TargetSet;
  /** index into the run's snapshots */
  snapshot: number;
  view: MapView;
}

interface SceneState {
  status: Status;
  error: string | null;
  assets: Assets | null;
  graph: RoadGraph | null;
  graphError: string | null;
  quickPicks: CriticalEdge[];
  layers: Record<LayerKey, boolean>;
  exaggeration: number;
  selected: Facility | null;
  resetNonce: number;
  scenario: ScenarioSettings;
  run: RunResult | null;
  runError: string | null;
  /** set when a click found no road, cleared when one does */
  pickMiss: boolean;

  load: () => Promise<void>;
  setLayer: (key: LayerKey, on: boolean) => void;
  setExaggeration: (value: number) => void;
  select: (facility: Facility | null) => void;
  resetView: () => void;

  pickEdge: (edge: number | null) => void;
  reportPickMiss: () => void;
  setSeverity: (severity: Severity) => void;
  setThreshold: (minutes: number) => void;
  setTargetSet: (set: TargetSet) => void;
  setSnapshot: (index: number) => void;
  setView: (view: MapView) => void;
  clearScenario: () => void;
}

const DEFAULT_SCENARIO: ScenarioSettings = {
  edge: null,
  severity: 'major',
  tGoldenMin: T_GOLDEN_MIN_DEFAULT,
  targetSet: 'emergency',
  snapshot: 0,
  view: 'after',
};

export const useSceneStore = create<SceneState>()((set, get) => {
  /** Runs the scenario for the current settings. Runs take milliseconds, so they happen on every change. */
  const recompute = (patch: Partial<ScenarioSettings>, resetPlayback: boolean): void => {
    const scenario = { ...get().scenario, ...patch };
    const { graph } = get();
    if (!graph || scenario.edge === null) {
      set({ scenario, run: null, runError: null });
      return;
    }
    try {
      const run = runScenario(graph, { type: 'landslide', edge: scenario.edge, severity: scenario.severity }, { tGoldenMin: scenario.tGoldenMin });
      const snapshot = resetPlayback ? 0 : Math.min(scenario.snapshot, run.snapshots.length - 1);
      set({ scenario: { ...scenario, snapshot }, run, runError: null });
    } catch (err) {
      set({ scenario, run: null, runError: err instanceof Error ? err.message : String(err) });
    }
  };

  return {
    status: 'idle',
    error: null,
    assets: null,
    graph: null,
    graphError: null,
    quickPicks: [],
    layers: { roads: true, facilities: true, places: true },
    exaggeration: 1.6,
    selected: null,
    resetNonce: 0,
    scenario: DEFAULT_SCENARIO,
    run: null,
    runError: null,
    pickMiss: false,

    load: async () => {
      if (get().status === 'loading' || get().status === 'ready') return;
      set({ status: 'loading', error: null });
      const base = `${import.meta.env.BASE_URL}data`;
      try {
        set({ assets: await loadAssets(base), status: 'ready' });
      } catch (err) {
        set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
        return;
      }
      try {
        const graph = await loadGraph(base);
        set({ graph, graphError: null, quickPicks: rankCriticalEdges(graph, { top: 4, onePerRoad: true }) });
      } catch (err) {
        set({ graphError: err instanceof Error ? err.message : String(err) });
      }
    },

    setLayer: (key, on) => set((s) => ({ layers: { ...s.layers, [key]: on } })),
    setExaggeration: (value) => set({ exaggeration: value }),
    select: (facility) => set({ selected: facility }),
    resetView: () => set((s) => ({ resetNonce: s.resetNonce + 1 })),

    pickEdge: (edge) => {
      set({ pickMiss: false });
      recompute({ edge, view: 'after' }, true);
    },
    reportPickMiss: () => set({ pickMiss: true }),
    setSeverity: (severity) => recompute({ severity }, true),
    setThreshold: (minutes) => {
      if (Number.isFinite(minutes)) recompute({ tGoldenMin: Math.min(240, Math.max(10, Math.round(minutes))) }, false);
    },
    setTargetSet: (targetSet) => set((s) => ({ scenario: { ...s.scenario, targetSet } })),
    setSnapshot: (index) => set((s) => ({ scenario: { ...s.scenario, snapshot: index } })),
    setView: (view) => set((s) => ({ scenario: { ...s.scenario, view } })),
    clearScenario: () => set({ scenario: { ...get().scenario, edge: null, snapshot: 0, view: 'after' }, run: null, runError: null, pickMiss: false }),
  };
});
