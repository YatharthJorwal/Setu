import { useFrame } from '@react-three/fiber';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef } from 'react';
import { BufferAttribute, BufferGeometry, Object3D, type InstancedMesh, type Mesh } from 'three';
import { toWorldXZ } from '../lib/geo';
import { pinGeometryData, type PinHead } from '../lib/markerGeometry';
import { FACILITY_COLORS, PLACE_COLOR } from '../lib/palette';
import { isEmergencyTier, isPrimaryTier } from '../lib/tiers';
import { worldHeight } from '../lib/terrain';
import type { Facility } from '../lib/types';
import { DETAIL_MARKER_DISTANCE } from '../lib/view';
import { useSceneStore } from '../state/store';
import { cameraDistance, unitPerPixel } from './camera';

const MARKER_LIFT = 20;

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

function usePinGeometry(head: PinHead): BufferGeometry {
  const geometry = useMemo(() => {
    const data = pinGeometryData(head);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(data.positions, 3));
    g.setIndex(new BufferAttribute(data.indices, 1));
    g.computeVertexNormals();
    return g;
  }, [head]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

interface PinsProps {
  items: Facility[];
  head: PinHead;
  color: string;
  /** head size in screen pixels */
  px: number;
  /** only drawn when the camera is close, to keep the overview readable */
  detailOnly?: boolean;
}

/** Slim facility pins that stay the same small size on screen at any zoom. */
function FacilityPins({ items, head, color, px, detailOnly = false }: PinsProps) {
  const meshRef = useRef<InstancedMesh>(null);
  const positions = useWorldPositions(items);
  const geometry = usePinGeometry(head);
  const select = useSceneStore((s) => s.select);
  const dummy = useMemo(() => new Object3D(), []);
  const lastUnit = useRef(0);

  const apply = useCallback(
    (unit: number) => {
      const mesh = meshRef.current;
      if (!mesh) return;
      positions.forEach((p, i) => {
        dummy.position.set(p[0], p[1], p[2]);
        dummy.scale.setScalar(px * unit);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere(); // keeps pointer picking accurate after moving or scaling instances
      lastUnit.current = unit;
    },
    [positions, px, dummy],
  );

  useEffect(() => {
    lastUnit.current = 0; // force a redraw on the next frame
  }, [apply]);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    if (detailOnly) mesh.visible = cameraDistance(state) < DETAIL_MARKER_DISTANCE;
    const unit = unitPerPixel(state);
    if (Math.abs(unit - lastUnit.current) / Math.max(lastUnit.current, 1e-9) > 0.02) apply(unit);
  });

  if (items.length === 0) return null;
  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, items.length]}
      frustumCulled={false}
      onPointerMove={(e) => {
        if (!meshRef.current?.visible) return; // hidden markers must not react to the pointer
        e.stopPropagation();
        if (e.instanceId !== undefined) select(items[e.instanceId] ?? null);
      }}
      onPointerOut={() => select(null)}
    >
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.05} />
    </instancedMesh>
  );
}

export function FacilityMarkers() {
  const facilities = useSceneStore((s) => s.assets?.facilities.facilities);
  const groups = useMemo(() => {
    const all = facilities ?? [];
    return {
      emergency: all.filter((f) => isEmergencyTier(f.tier_guess)),
      primary: all.filter((f) => isPrimaryTier(f.tier_guess)),
      minor: all.filter((f) => !isEmergencyTier(f.tier_guess) && !isPrimaryTier(f.tier_guess)),
    };
  }, [facilities]);
  return (
    <group>
      <FacilityPins items={groups.minor} head="box" color={FACILITY_COLORS.other} px={2.6} detailOnly />
      <FacilityPins items={groups.primary} head="box" color={FACILITY_COLORS.other} px={3.4} />
      <FacilityPins items={groups.emergency} head="diamond" color={FACILITY_COLORS.emergency} px={4.6} />
    </group>
  );
}

/** Thin ring around the selected facility, so a choice made in the list can be found on the map. */
export function SelectedRing() {
  const selected = useSceneStore((s) => s.selected);
  const positions = useWorldPositions(useMemo(() => (selected ? [selected] : []), [selected]));
  const ref = useRef<Mesh>(null);
  useFrame((state) => {
    ref.current?.scale.setScalar(12 * unitPerPixel(state));
  });
  const p = positions[0];
  if (!selected || !p) return null;
  return (
    <mesh ref={ref} position={[p[0], p[1] + 1, p[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <torusGeometry args={[1, 0.09, 6, 32]} />
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
      pos[i * 3 + 1] = worldHeight(assets.terrain, pl.lon, pl.lat, assets.meta.elevation_min_m, exaggeration) + 25;
      pos[i * 3 + 2] = z;
    });
    g.setAttribute('position', new BufferAttribute(pos, 3));
    return g;
  }, [assets, exaggeration]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  if (!assets?.places || assets.places.places.length === 0) return null;
  return (
    <points geometry={geometry}>
      <pointsMaterial size={2.5} sizeAttenuation={false} color={PLACE_COLOR} transparent opacity={0.8} />
    </points>
  );
}
