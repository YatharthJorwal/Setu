// Everything the printable report needs, already turned into text. The page builder only lays it out.

export interface ReportKpi {
  label: string;
  tag: 'data' | 'assumption';
  before: string;
  after: string;
}

export interface ReportBrief {
  kind: 'ai' | 'template';
  summary: string;
  risks: string[];
  actions: Array<{ action: string; rationale: string; metrics: string[] }>;
  caveats: string[];
  sourceNote: string;
}

export interface ReportData {
  /** shown as written, for example "2026-10-26 14:05 UTC" */
  generatedAt: string;
  scenario: {
    road: string;
    roadDetail: string;
    severity: string;
    reopens: string;
    destinations: string;
    threshold: string;
    moment: string;
  };
  kpis: ReportKpi[];
  people: string;
  restored: string | null;
  worst: Array<{ place: string; status: 'cut_off' | 'delayed'; detail: string }>;
  notCounted: string;
  brief: ReportBrief | null;
  assumptions: Array<{ label: string; value: string; unit: string }>;
  sources: Array<{ dataset: string; licence: string; retrieved: string; coverage: string; gaps: string }>;
  /** a data: URL of the map, or null */
  screenshot: string | null;
  notice: string;
  credits: string[];
  /** pretty-printed run record: simulator version, seed and inputs */
  record: string;
}
