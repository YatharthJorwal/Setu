import { create } from 'zustand';
import { buildBriefInput, fetchBrief, hostedBrief, type BriefInput, type BriefLanguage, type BriefResult } from '../brief';
import { loadAssets, type Assets } from '../lib/assets';
import type { Facility } from '../lib/types';
import { loadGraph } from './graphLoader';
import {
  T_GOLDEN_MIN_DEFAULT,
  populationSummary,
  rankCriticalEdges,
  runScenario,
  type CriticalEdge,
  type PopulationSummary,
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

export interface BriefState {
  status: 'idle' | 'loading' | 'ready';
  result: BriefResult | null;
  /** the numbers the brief was written from, kept for metric labels */
  input: BriefInput | null;
}

/**
 * The AI brief needs a server route (the dev server's /api/brief) that talks to a model on the same computer.
 * A hosted static copy has none, so it skips the request and says so. VITE_BRIEF_API=on forces it for other setups.
 */
const BRIEF_API = import.meta.env.DEV || import.meta.env.VITE_BRIEF_API === 'on';

const IDLE_BRIEF: BriefState = { status: 'idle', result: null, input: null };
/** bumped whenever the scenario changes, so a late answer for an old scenario is dropped */
let briefToken = 0;
let missTimer: ReturnType<typeof setTimeout> | undefined;

interface SceneState {
  status: Status;
  error: string | null;
  assets: Assets | null;
  graph: RoadGraph | null;
  graphError: string | null;
  quickPicks: CriticalEdge[];
  corridor: PopulationSummary | null;
  layers: Record<LayerKey, boolean>;
  exaggeration: number;
  selected: Facility | null;
  resetNonce: number;
  scenario: ScenarioSettings;
  run: RunResult | null;
  runError: string | null;
  /** set when a click found no road, cleared when one does */
  pickMiss: boolean;
  brief: BriefState;

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
  requestBrief: (language: BriefLanguage) => Promise<void>;
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
    briefToken++;
    if (!graph || scenario.edge === null) {
      set({ scenario, run: null, runError: null, brief: IDLE_BRIEF });
      return;
    }
    try {
      const run = runScenario(graph, { type: 'landslide', edge: scenario.edge, severity: scenario.severity }, { tGoldenMin: scenario.tGoldenMin });
      const snapshot = resetPlayback ? 0 : Math.min(scenario.snapshot, run.snapshots.length - 1);
      set({ scenario: { ...scenario, snapshot }, run, runError: null, brief: IDLE_BRIEF });
    } catch (err) {
      set({ scenario, run: null, runError: err instanceof Error ? err.message : String(err), brief: IDLE_BRIEF });
    }
  };

  return {
    status: 'idle',
    error: null,
    assets: null,
    graph: null,
    graphError: null,
    quickPicks: [],
    corridor: null,
    layers: { roads: true, facilities: true, places: true },
    exaggeration: 1.6,
    selected: null,
    resetNonce: 0,
    scenario: DEFAULT_SCENARIO,
    run: null,
    runError: null,
    pickMiss: false,
    brief: IDLE_BRIEF,

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
        set({
          graph,
          graphError: null,
          quickPicks: rankCriticalEdges(graph, { top: 4, onePerRoad: true }),
          corridor: populationSummary(graph),
        });
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
    reportPickMiss: () => {
      set({ pickMiss: true });
      clearTimeout(missTimer);
      missTimer = setTimeout(() => set({ pickMiss: false }), 3500);
    },
    setSeverity: (severity) => recompute({ severity }, true),
    setThreshold: (minutes) => {
      if (Number.isFinite(minutes)) recompute({ tGoldenMin: Math.min(240, Math.max(10, Math.round(minutes))) }, false);
    },
    setTargetSet: (targetSet) => {
      briefToken++;
      set((s) => ({ scenario: { ...s.scenario, targetSet }, brief: IDLE_BRIEF }));
    },
    setSnapshot: (index) => set((s) => ({ scenario: { ...s.scenario, snapshot: index } })),
    setView: (view) => set((s) => ({ scenario: { ...s.scenario, view } })),
    clearScenario: () => {
      briefToken++;
      set({ scenario: { ...get().scenario, edge: null, snapshot: 0, view: 'after' }, run: null, runError: null, pickMiss: false, brief: IDLE_BRIEF });
    },

    requestBrief: async (language) => {
      const { graph, run, scenario } = get();
      if (!graph || !run || scenario.edge === null) return;
      const input = buildBriefInput(
        graph,
        run,
        { edge: scenario.edge, severity: scenario.severity, tGoldenMin: scenario.tGoldenMin, targetSet: scenario.targetSet },
        language,
      );
      const token = ++briefToken;
      set({ brief: { status: 'loading', result: null, input } });
      const result = BRIEF_API ? await fetchBrief(input) : hostedBrief(input);
      if (token !== briefToken) return; // the scenario changed while the answer was on its way
      set({ brief: { status: 'ready', result, input } });
    },
  };
});
