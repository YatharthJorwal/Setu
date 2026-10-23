import { useFrame } from '@react-three/fiber';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, Object3D, type InstancedMesh, type Mesh } from 'three';
import { toWorldXZ } from '../lib/geo';
import { FACILITY_COLORS, PLACE_COLOR } from '../lib/palette';
import { isEmergencyTier } from '../lib/tiers';
import { worldHeight } from '../lib/terrain';
import type { Facility } from '../lib/types';
import { useSceneStore } from '../state/store';

const MARKER_LIFT = 60;
/** Markers grow with camera distance so they stay visible when zoomed out. */
const scaleFor = (distance: number): number => Math.min(10, Math.max(1, distance / 15000));

function useWorldPositions(items: Facility[]): Array<[number, number, number]> {
  const assets = useSceneStore((s) => s.assets);
  const exaggeration = useDeferredValue(useSceneStore((s) => s.exaggeration));
  return useMemo(() => {
    if (!assets) return [];
    return items.map((f) => {
      const { x, z } = toWorldXZ(assets.frame, f.lon, f.lat);
      const y = worldHeight(assets.terrain, f.lon, f.lat, assets.meta.elevation_min_m, exaggeration) + MARKER_LIFT;
      return [x, y, z];
    });
  }, [assets, items, exaggeration]);
}

interface InstancedProps {
  items: Facility[];
  shape: 'octahedron' | 'box';
  color: string;
  size: number;
}

function InstancedFacilities({ items, shape, color, size }: InstancedProps) {
  const meshRef = useRef<InstancedMesh>(null);
  const positions = useWorldPositions(items);
  const select = useSceneStore((s) => s.select);
  const dummy = useMemo(() => new Object3D(), []);
  const lastScale = useRef(0);

  const apply = useCallback(
    (scale: number) => {
      const mesh = meshRef.current;
      if (!mesh) return;
      positions.forEach((p, i) => {
        dummy.position.set(p[0], p[1], p[2]);
        dummy.scale.setScalar(size * scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere(); // keeps pointer picking accurate after moving or scaling instances
      lastScale.current = scale;
    },
    [positions, size, dummy],
  );

  useEffect(() => {
    apply(lastScale.current || 1);
  }, [apply]);

  useFrame(({ camera }) => {
    const scale = scaleFor(camera.position.length());
    if (Math.abs(scale - lastScale.current) / Math.max(lastScale.current, 1e-6) > 0.03) apply(scale);
  });

  if (items.length === 0) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, items.length]}
      frustumCulled={false}
      onPointerMove={(e) => {
        e.stopPropagation();
        if (e.instanceId !== undefined) select(items[e.instanceId] ?? null);
      }}
      onPointerOut={() => select(null)}
    >
      {shape === 'octahedron' ? <octahedronGeometry args={[1, 0]} /> : <boxGeometry args={[1, 1, 1]} />}
      <meshStandardMaterial color={color} roughness={0.6} metalness={0} />
    </instancedMesh>
  );
}

export function FacilityMarkers() {
  const facilities = useSceneStore((s) => s.assets?.facilities.facilities);
  const { emergency, other } = useMemo(() => {
    const all = facilities ?? [];
    return {
      emergency: all.filter((f) => isEmergencyTier(f.tier_guess)),
      other: all.filter((f) => !isEmergencyTier(f.tier_guess)),
    };
  }, [facilities]);
  return (
    <group>
      <InstancedFacilities items={other} shape="box" color={FACILITY_COLORS.other} size={90} />
      <InstancedFacilities items={emergency} shape="octahedron" color={FACILITY_COLORS.emergency} size={170} />
    </group>
  );
}

/** Flat ring around the selected facility, so a choice made in the list can be found on the map. */
export function SelectedRing() {
  const selected = useSceneStore((s) => s.selected);
  const positions = useWorldPositions(useMemo(() => (selected ? [selected] : []), [selected]));
  const ref = useRef<Mesh>(null);
  useFrame(({ camera }) => {
    ref.current?.scale.setScalar(300 * scaleFor(camera.position.length()));
  });
  const p = positions[0];
  if (!selected || !p) return null;
  return (
    <mesh ref={ref} position={p} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[1, 0.1, 8, 32]} />
      <meshBasicMaterial color="#ffffff" />
    </mesh>
  );
}

export function Places() {
  const assets = useSceneStore((s) => s.assets);
  const exaggeration = useDeferredValue(useSceneStore((s) => s.exaggeration));
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    const places = assets?.places?.places ?? [];
    if (!assets || places.length === 0) return g;
    const pos = new Float32Array(places.length * 3);
    places.forEach((pl, i) => {
      const { x, z } = toWorldXZ(assets.frame, pl.lon, pl.lat);
      pos[i * 3] = x;
      pos[i * 3 + 1] = worldHeight(assets.terrain, pl.lon, pl.lat, assets.meta.elevation_min_m, exaggeration) + 30;
      pos[i * 3 + 2] = z;
    });
    g.setAttribute('position', new BufferAttribute(pos, 3));
    return g;
  }, [assets, exaggeration]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (!assets?.places || assets.places.places.length === 0) return null;
  return (
    <points geometry={geometry}>
      <pointsMaterial size={3} sizeAttenuation={false} color={PLACE_COLOR} />
    </points>
  );
}
