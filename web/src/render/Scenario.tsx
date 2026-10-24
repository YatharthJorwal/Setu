import { useFrame } from '@react-three/fiber';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, Object3D, type InstancedMesh, type Mesh } from 'three';
import { buildEdgeSegments, drapePoint } from '../lib/drape';
import { STATE_COLORS } from '../lib/palette';
import { polylineMidpoint } from '../lib/pick';
import { scaleForDistance } from '../lib/view';
import { activeMutations } from '../state/sim-api';
import { useSceneStore } from '../state/store';

type Vec3 = [number, number, number];

function SegmentLines({ positions, color }: { positions: Float32Array; color: string }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(positions, 3));
    return g;
  }, [positions]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (positions.length === 0) return null;
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  );
}

/** Tall thin post so a closed road can be found from far away. */
function Pin({ position }: { position: Vec3 }) {
  const ref = useRef<Mesh>(null);
  useFrame(({ camera }) => {
    const s = scaleForDistance(camera.position.length());
    ref.current?.scale.set(s, 1, s);
  });
  return (
    <mesh ref={ref} position={[position[0], position[1] + 1500, position[2]]}>
      <cylinderGeometry args={[40, 40, 3000, 8]} />
      <meshBasicMaterial color={STATE_COLORS.closed} />
    </mesh>
  );
}

interface MarkerProps {
  points: Vec3[];
  shape: 'ring' | 'cone';
  color: string;
  size: number;
}

/** Rings mark places cut off; cones mark places newly delayed. Shape carries the meaning, colour backs it up. */
function ScenarioMarkers({ points, shape, color, size }: MarkerProps) {
  const ref = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const lastScale = useRef(0);

  const apply = useCallback(
    (scale: number) => {
      const mesh = ref.current;
      if (!mesh) return;
      points.forEach((p, i) => {
        dummy.position.set(p[0], p[1], p[2]);
        dummy.rotation.set(shape === 'ring' ? Math.PI / 2 : 0, 0, 0);
        dummy.scale.setScalar(size * scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      lastScale.current = scale;
    },
    [points, shape, size, dummy],
  );

  useEffect(() => {
    apply(lastScale.current || 1);
  }, [apply]);

  useFrame(({ camera }) => {
    const scale = scaleForDistance(camera.position.length());
    if (Math.abs(scale - lastScale.current) / Math.max(lastScale.current, 1e-6) > 0.03) apply(scale);
  });

  if (points.length === 0) return null;
  return (
    <instancedMesh key={`${shape}-${points.length}`} ref={ref} args={[undefined, undefined, points.length]} frustumCulled={false}>
      {shape === 'ring' ? <torusGeometry args={[1, 0.25, 8, 20]} /> : <coneGeometry args={[0.7, 1.6, 10]} />}
      <meshBasicMaterial color={color} />
    </instancedMesh>
  );
}

const ROAD_HIGHLIGHT_LIFT = 24; // above the plain road lines (12) so they do not z-fight

/** What the scenario does to the map: the road, slowed neighbours, and the places affected. */
export function ScenarioOverlay() {
  const assets = useSceneStore((s) => s.assets);
  const graph = useSceneStore((s) => s.graph);
  const run = useSceneStore((s) => s.run);
  const scenario = useSceneStore((s) => s.scenario);
  const exaggeration = useDeferredValue(useSceneStore((s) => s.exaggeration));

  const after = scenario.view === 'after';

  const roadState = useMemo(() => {
    if (!assets || !graph || !run || scenario.edge === null) return null;
    const t = run.snapshots[scenario.snapshot]?.t_s ?? 0;
    const active = activeMutations(run.mutations, t);
    const closed = active.filter((m) => m.factor === 0).map((m) => m.edge);
    const slowed = active.filter((m) => m.factor > 0).map((m) => m.edge);
    const seg = (edges: number[]) =>
      buildEdgeSegments(edges, graph.edgeGeometry, assets.terrain, assets.frame, exaggeration, ROAD_HIGHLIGHT_LIFT);
    const mid = polylineMidpoint(graph.edgeGeometry[scenario.edge]);
    return {
      selected: seg([scenario.edge]),
      closed: seg(closed),
      slowed: seg(slowed),
      isClosed: closed.length > 0,
      pin: drapePoint(assets.terrain, assets.frame, mid[0], mid[1], exaggeration, ROAD_HIGHLIGHT_LIFT),
    };
  }, [assets, graph, run, scenario.edge, scenario.snapshot, exaggeration]);

  const marks = useMemo(() => {
    if (!assets || !graph || !run || !after) return { isolated: [] as Vec3[], delayed: [] as Vec3[] };
    const rows = run.placesBySnapshot[scenario.snapshot]?.[scenario.targetSet] ?? [];
    const toPoint = (place: number): Vec3 => {
      const p = graph.places[place];
      return drapePoint(assets.terrain, assets.frame, p.lon, p.lat, exaggeration, 70);
    };
    return {
      isolated: rows.filter((r) => r.status === 'isolated').map((r) => toPoint(r.place)),
      // only places the event pushed over the threshold; places already beyond it before are not the event's doing
      delayed: rows
        .filter((r) => r.status === 'delayed' && r.before_min <= scenario.tGoldenMin)
        .map((r) => toPoint(r.place)),
    };
  }, [assets, graph, run, after, scenario.snapshot, scenario.targetSet, scenario.tGoldenMin, exaggeration]);

  if (!roadState) return null;
  const showClosure = after && roadState.isClosed;
  return (
    <group>
      {showClosure ? (
        <>
          <SegmentLines positions={roadState.slowed} color={STATE_COLORS.slowed} />
          <SegmentLines positions={roadState.closed} color={STATE_COLORS.closed} />
          <Pin position={roadState.pin} />
        </>
      ) : (
        <SegmentLines positions={roadState.selected} color={STATE_COLORS.selected} />
      )}
      <ScenarioMarkers points={marks.delayed} shape="cone" color={STATE_COLORS.delayed} size={190} />
      <ScenarioMarkers points={marks.isolated} shape="ring" color={STATE_COLORS.isolated} size={230} />
    </group>
  );
}
