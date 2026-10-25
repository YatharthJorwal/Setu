// Shapes for the situation brief (SPEC section 8). The AI narrates numbers the simulation produced; it never computes them.

export type BriefLanguage = 'en' | 'hi';
export type MetricTag = 'data' | 'assumption';

export interface BriefMetric {
  /** null means unknown, and must be described as unknown, never estimated */
  value: number | null;
  unit: string;
  tag: MetricTag;
  label: string;
}

export interface BriefInput {
  language: BriefLanguage;
  scenario: {
    type: 'landslide';
    severity: string;
    road: string;
    road_class: string;
    length_km: number;
    reopens_after_h: number;
    destinations: 'emergency' | 'primary';
    threshold_min: number;
  };
  metrics: Record<string, BriefMetric>;
  top_affected: Array<{
    place: string;
    status: 'cut_off' | 'delayed';
    before_min: number | null;
    after_min: number | null;
  }>;
  data_gaps: { places_off_road: number; places_no_route_before: number };
  assumptions: Array<{ label: string; value: string; unit: string }>;
}

export interface BriefAction {
  action: string;
  rationale: string;
  /** keys of BriefInput.metrics that support this action */
  metric_refs: string[];
}

export interface BriefOutput {
  summary: string;
  key_risks: string[];
  recommended_actions: BriefAction[];
  caveats: string[];
}

export type BriefSource = 'ai' | 'template';

export interface BriefResult {
  brief: BriefOutput;
  source: BriefSource;
  /** the model that wrote it, when source is "ai" */
  model?: string;
  /** why the template was used instead of the AI service */
  reason?: 'no_key' | 'unreachable' | 'invalid' | 'language' | 'error';
}

export const BRIEF_LIMITS = {
  summary: 600,
  risk: 260,
  action: 220,
  rationale: 320,
  caveat: 260,
  name: 60,
  maxRisks: 5,
  maxActions: 5,
  maxCaveats: 5,
  maxTopAffected: 10,
  maxAssumptions: 12,
  maxMetrics: 24,
} as const;
