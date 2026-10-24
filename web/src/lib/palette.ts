import type { RoadGroup } from './roads';

// Shared by the 3D scene and the legend so they cannot drift apart.
export const ROAD_COLORS: Record<RoadGroup, string> = {
  major: '#e8e3d4',
  medium: '#bdb6a2',
  minor: '#948f80',
  track: '#706c5e',
  bridge: '#5ab4ea',
};

export const FACILITY_COLORS = { emergency: '#f2b134', other: '#9db4c8' } as const;
export const PLACE_COLOR = '#efece2';

// Scenario state. Always paired with a shape or label, never colour alone (RULES U2).
export const STATE_COLORS = {
  closed: '#ff5a4f',
  slowed: '#f2b134',
  isolated: '#ff5a4f',
  delayed: '#f2b134',
  selected: '#ffffff',
} as const;
