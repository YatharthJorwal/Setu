// Legend icons drawn to match the markers on the map (diamond, square, ring, cone, dot, post).

interface IconProps {
  color: string;
}

const base = { width: 22, height: 16, viewBox: '0 0 22 16', 'aria-hidden': true as const, focusable: false };

export function LineIcon({ color, dashed = false }: IconProps & { dashed?: boolean }) {
  return (
    <svg {...base}>
      <line x1="1.5" y1="8" x2="20.5" y2="8" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeDasharray={dashed ? '2 4' : undefined} />
    </svg>
  );
}

export function DiamondIcon({ color }: IconProps) {
  return (
    <svg {...base}>
      <path d="M11 2 L16 8 L11 14 L6 8 Z" fill={color} />
    </svg>
  );
}

export function SquareIcon({ color }: IconProps) {
  return (
    <svg {...base}>
      <rect x="7.5" y="4.5" width="7" height="7" rx="1" fill={color} />
    </svg>
  );
}

export function DotIcon({ color }: IconProps) {
  return (
    <svg {...base}>
      <circle cx="11" cy="8" r="2.4" fill={color} />
    </svg>
  );
}

export function RingIcon({ color }: IconProps) {
  return (
    <svg {...base}>
      <circle cx="11" cy="8" r="4.6" fill="none" stroke={color} strokeWidth="1.8" />
    </svg>
  );
}

export function ConeIcon({ color }: IconProps) {
  return (
    <svg {...base}>
      <path d="M11 2.6 L15 13 L7 13 Z" fill={color} />
    </svg>
  );
}

export function PostIcon({ color }: IconProps) {
  return (
    <svg {...base}>
      <line x1="11" y1="3" x2="11" y2="14" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Small bridge mark for the wordmark. */
export function BridgeMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" focusable="false">
      <path d="M3 17 Q13 5 23 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="2" y1="18.5" x2="24" y2="18.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="8" y1="12.2" x2="8" y2="18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="13" y1="10" x2="13" y2="18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="18" y1="12.2" x2="18" y2="18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
