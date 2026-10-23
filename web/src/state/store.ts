import { create } from 'zustand';
import { loadAssets, type Assets } from '../lib/assets';
import type { Facility } from '../lib/types';

export type LayerKey = 'roads' | 'facilities' | 'places';
type Status = 'idle' | 'loading' | 'ready' | 'error';

interface SceneState {
  status: Status;
  error: string | null;
  assets: Assets | null;
  layers: Record<LayerKey, boolean>;
  exaggeration: number;
  selected: Facility | null;
  resetNonce: number;
  load: () => Promise<void>;
  setLayer: (key: LayerKey, on: boolean) => void;
  setExaggeration: (value: number) => void;
  select: (facility: Facility | null) => void;
  resetView: () => void;
}

export const useSceneStore = create<SceneState>()((set, get) => ({
  status: 'idle',
  error: null,
  assets: null,
  layers: { roads: true, facilities: true, places: true },
  exaggeration: 1.6,
  selected: null,
  resetNonce: 0,

  load: async () => {
    if (get().status === 'loading' || get().status === 'ready') return;
    set({ status: 'loading', error: null });
    try {
      const assets = await loadAssets(`${import.meta.env.BASE_URL}data`);
      set({ assets, status: 'ready' });
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },

  setLayer: (key, on) => set((s) => ({ layers: { ...s.layers, [key]: on } })),
  setExaggeration: (value) => set({ exaggeration: value }),
  select: (facility) => set({ selected: facility }),
  resetView: () => set((s) => ({ resetNonce: s.resetNonce + 1 })),
}));
