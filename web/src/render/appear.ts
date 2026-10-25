import { useFrame } from '@react-three/fiber';
import { useEffect, useRef, type MutableRefObject } from 'react';
import { useReducedMotion } from '../lib/useReducedMotion';
import { easeOut } from '../lib/view';

/**
 * A 0 to 1 value that eases up whenever `key` changes, for short appear animations.
 * Jumps straight to 1 when the person prefers reduced motion. Read `.current` inside useFrame.
 */
export function useAppear(key: unknown, durationMs = 380): MutableRefObject<number> {
  const reduced = useReducedMotion();
  const start = useRef(performance.now());
  const value = useRef(reduced ? 1 : 0);

  useEffect(() => {
    start.current = performance.now();
    value.current = reduced ? 1 : 0;
  }, [key, reduced]);

  useFrame(() => {
    if (value.current < 1) {
      value.current = reduced ? 1 : easeOut((performance.now() - start.current) / durationMs);
    }
  });
  return value;
}
