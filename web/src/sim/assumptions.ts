// Every modelled constant lives here (RULES C6), with its basis and status.
// Nothing in this file is measured data. All values are ASSUMPTIONS until validated with local officials.

export type AssumptionStatus = 'assumption' | 'sourced' | 'validated';

export interface AssumptionRow {
  key: string;
  label: string;
  value: string;
  unit: string;
  basis: string;
  status: AssumptionStatus;
}

export type Severity = 'minor' | 'major' | 'severe';
export const SEVERITIES: readonly Severity[] = ['minor', 'major', 'severe'];

// ---- travel speeds ----------------------------------------------------------------------------

const SPEED_BASIS =
  'Illustrative average speed on Himalayan hill roads, including bends, gradient and traffic. Not measured. OpenStreetMap carries almost no speed data here.';

const SPEED_KMH: Readonly<Record<string, number>> = {
  trunk: 30,
  primary: 30,
  secondary: 25,
  tertiary: 22,
  unclassified: 15,
  residential: 15,
  service: 12,
  living_street: 10,
};
export const DEFAULT_SPEED_KMH = 15;

export function freeSpeedKmh(className: string): number {
  return SPEED_KMH[className] ?? DEFAULT_SPEED_KMH;
}

// ---- access threshold -------------------------------------------------------------------------

export const T_GOLDEN_MIN_DEFAULT = 60;

// ---- landslide clearance ----------------------------------------------------------------------

const CLEARANCE_BASIS =
  'Illustrative. Main roads are assumed to reopen faster than village roads, and worse slides take longer. To be validated with district and road-agency officials.';

const CLEARANCE_H: Readonly<Record<Severity, { main: number; other: number }>> = {
  minor: { main: 3, other: 12 },
  major: { main: 12, other: 48 },
  severe: { main: 48, other: 168 },
};

const MAIN_CLASSES: ReadonlySet<string> = new Set(['trunk', 'primary']);

export function isMainRoadClass(className: string): boolean {
  return MAIN_CLASSES.has(className);
}

export function clearanceHours(className: string, severity: Severity): number {
  const row = CLEARANCE_H[severity];
  return isMainRoadClass(className) ? row.main : row.other;
}

// ---- debris and caution on neighbouring roads --------------------------------------------------

const ADJACENT_FACTOR: Readonly<Record<Severity, number>> = { minor: 1, major: 0.85, severe: 0.7 };

export function adjacentSpeedFactor(severity: Severity): number {
  return ADJACENT_FACTOR[severity];
}

// ---- table for the in-app assumptions panel ---------------------------------------------------

export const ASSUMPTIONS: readonly AssumptionRow[] = [
  ...Object.entries(SPEED_KMH).map(([cls, v]) => ({
    key: `speed.${cls}`,
    label: `Average speed on ${cls} roads`,
    value: String(v),
    unit: 'km/h',
    basis: SPEED_BASIS,
    status: 'assumption' as const,
  })),
  {
    key: 'speed.default',
    label: 'Average speed on any other road class',
    value: String(DEFAULT_SPEED_KMH),
    unit: 'km/h',
    basis: SPEED_BASIS,
    status: 'assumption',
  },
  {
    key: 'access.t_golden',
    label: 'Access time threshold for delayed care',
    value: String(T_GOLDEN_MIN_DEFAULT),
    unit: 'minutes',
    basis: 'The widely used "golden hour" idea for emergency care. Adjustable by the user.',
    status: 'assumption',
  },
  ...(Object.keys(CLEARANCE_H) as Severity[]).flatMap((sev) => [
    {
      key: `clearance.${sev}.main`,
      label: `Time to reopen a ${sev} landslide on a trunk or primary road`,
      value: String(CLEARANCE_H[sev].main),
      unit: 'hours',
      basis: CLEARANCE_BASIS,
      status: 'assumption' as const,
    },
    {
      key: `clearance.${sev}.other`,
      label: `Time to reopen a ${sev} landslide on any other road`,
      value: String(CLEARANCE_H[sev].other),
      unit: 'hours',
      basis: CLEARANCE_BASIS,
      status: 'assumption' as const,
    },
  ]),
  ...(Object.keys(ADJACENT_FACTOR) as Severity[]).map((sev) => ({
    key: `adjacent.${sev}`,
    label: `Speed factor on roads touching a ${sev} landslide`,
    value: String(ADJACENT_FACTOR[sev]),
    unit: 'x free speed',
    basis: 'Illustrative allowance for debris and caution next to the blockage while it lasts.',
    status: 'assumption' as const,
  })),
];
