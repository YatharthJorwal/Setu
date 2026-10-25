import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../lib/useReducedMotion';
import { easeOut } from '../lib/view';

interface Props {
  /** null renders a dash */
  value: number | null;
  durationMs?: number;
}

/** Counts up or down to a new value in a few hundred milliseconds. Shows the value at once if motion is reduced. */
export function AnimatedNumber({ value, durationMs = 420 }: Props) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState<number | null>(value);
  const current = useRef<number | null>(value);

  useEffect(() => {
    if (value === null || current.current === null || reduced || current.current === value) {
      current.current = value;
      setShown(value);
      return;
    }
    const from = current.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = (now - start) / durationMs;
      const v = k >= 1 ? value : Math.round(from + (value - from) * easeOut(k));
      current.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced, durationMs]);

  const text = reduced ? value : shown;
  return <>{text === null ? '-' : text.toLocaleString('en')}</>;
}
