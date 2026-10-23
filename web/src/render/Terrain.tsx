import { useDeferredValue, useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';
import { buildTerrainMesh } from '../lib/terrain';
import { useSceneStore } from '../state/store';

export function Terrain() {
  const assets = useSceneStore((s) => s.assets);
  const exaggeration = useDeferredValue(useSceneStore((s) => s.exaggeration));

  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    if (!assets) return g;
    const mesh = buildTerrainMesh(assets.terrain, assets.frame, exaggeration);
    g.setAttribute('position', new BufferAttribute(mesh.positions, 3));
    g.setAttribute('color', new BufferAttribute(mesh.colors, 3));
    g.setIndex(new BufferAttribute(mesh.indices, 1));
    g.computeVertexNormals();
    return g;
  }, [assets, exaggeration]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry}>
      {/* polygonOffset pushes the surface back a little so draped road lines never z-fight with it */}
      <meshStandardMaterial vertexColors roughness={1} metalness={0} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
    </mesh>
  );
}
