import type { RootState } from '@react-three/fiber';
import type { PerspectiveCamera, Vector3 } from 'three';
import { worldPerPixel } from '../lib/view';

/** Distance from the camera to the point it orbits. Falls back to the distance from the origin. */
export function cameraDistance(state: RootState): number {
  const camera = state.camera as PerspectiveCamera;
  const controls = state.controls as unknown as { target?: Vector3 } | null;
  return controls?.target ? camera.position.distanceTo(controls.target) : camera.position.length();
}

/** World units per screen pixel at the orbit point: scale markers by this to keep them one size on screen. */
export function unitPerPixel(state: RootState): number {
  const camera = state.camera as PerspectiveCamera;
  return worldPerPixel(cameraDistance(state), camera.fov, state.size.height);
}
