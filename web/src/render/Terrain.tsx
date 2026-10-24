import { useDeferredValue, useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';
import { buildPickIndex, nearestEdge } from '../lib/pick';
import { buildTerrainMesh } from '../lib/terrain';
import { useSceneStore } from '../state/store';

export function Terrain() {
  const assets = useSceneStore((s) => s.assets);
  const exaggeration = useDeferredValue(useSceneStore((s) => s.exaggeration));
  const graph = useSceneStore((s) => s.graph);
  const pickEdge = useSceneStore((s) => s.pickEdge);
  const reportPickMiss = useSceneStore((s) => s.reportPickMiss);

  const pickIndex = useMemo(
    () => (graph && assets ? buildPickIndex(graph.edgeGeometry, assets.frame) : null),
    [graph, assets],
  );

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
    <mesh
      geometry={geometry}
      onClick={(e) => {
        // a drag to rotate the view also ends in a click: ignore it
        if (!pickIndex || e.delta > 4) return;
        e.stopPropagation();
        const hit = nearestEdge(pickIndex, e.point.x, e.point.z, Math.max(150, e.distance * 0.012));
        if (hit) pickEdge(hit.edge);
        else reportPickMiss();
      }}
    >
      {/* polygonOffset pushes the surface back a little so draped road lines never z-fight with it */}
      <meshStandardMaterial vertexColors roughness={1} metalness={0} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
    </mesh>
  );
}
