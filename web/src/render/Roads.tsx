import { useDeferredValue, useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';
import { ROAD_COLORS } from '../lib/palette';
import { ROAD_GROUPS, buildRoadSegments, type RoadGroup } from '../lib/roads';
import { useSceneStore } from '../state/store';

export function Roads() {
  const assets = useSceneStore((s) => s.assets);
  const exaggeration = useDeferredValue(useSceneStore((s) => s.exaggeration));

  const geometries = useMemo(() => {
    const out = {} as Record<RoadGroup, BufferGeometry | null>;
    if (!assets) return out;
    const segments = buildRoadSegments(assets.roads, assets.terrain, assets.frame, exaggeration);
    for (const group of ROAD_GROUPS) {
      const positions = segments[group];
      if (positions.length === 0) {
        out[group] = null;
        continue;
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(positions, 3));
      out[group] = g;
    }
    return out;
  }, [assets, exaggeration]);

  useEffect(
    () => () => {
      for (const g of Object.values(geometries)) g?.dispose();
    },
    [geometries],
  );

  return (
    <group>
      {ROAD_GROUPS.map((group) => {
        const geometry = geometries[group];
        return geometry ? (
          <lineSegments key={group} geometry={geometry}>
            <lineBasicMaterial color={ROAD_COLORS[group]} />
          </lineSegments>
        ) : null;
      })}
    </group>
  );
}
