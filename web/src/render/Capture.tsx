import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { registerCapture } from '../state/capture';

/** Lets the report take a picture of the map. Draws one frame and reads it back in the same step. */
export function CaptureBridge() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    registerCapture(() => {
      gl.render(scene, camera);
      return gl.domElement.toDataURL('image/jpeg', 0.88);
    });
    return () => registerCapture(null);
  }, [gl, scene, camera]);
  return null;
}
