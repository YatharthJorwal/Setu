import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { useSceneStore } from '../state/store';
import { FacilityMarkers, Places, SelectedRing } from './Markers';
import { Roads } from './Roads';
import { Terrain } from './Terrain';

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function Controls() {
  const ref = useRef<ComponentRef<typeof OrbitControls>>(null);
  const resetNonce = useSceneStore((s) => s.resetNonce);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    ref.current?.saveState();
  }, []);
  useEffect(() => {
    if (resetNonce > 0) ref.current?.reset();
  }, [resetNonce]);

  return (
    <OrbitControls
      ref={ref}
      makeDefault
      target={[0, 1500, 0]}
      minDistance={1500}
      maxDistance={150000}
      maxPolarAngle={1.45}
      enableDamping={!reducedMotion}
      dampingFactor={0.08}
    />
  );
}

export function Scene() {
  const layers = useSceneStore((s) => s.layers);
  return (
    <Canvas
      flat
      dpr={[1, 2]}
      camera={{ position: [0, 45000, 60000], fov: 40, near: 100, far: 400000 }}
      aria-label="3D map of the Rudraprayag corridor"
    >
      <color attach="background" args={['#0e1216']} />
      <hemisphereLight args={['#cdd7e2', '#2b302b', 1.0]} />
      <directionalLight position={[-40000, 35000, -40000]} intensity={2.4} />
      <Terrain />
      {layers.roads && <Roads />}
      {layers.facilities && <FacilityMarkers />}
      {layers.facilities && <SelectedRing />}
      {layers.places && <Places />}
      <Controls />
    </Canvas>
  );
}
