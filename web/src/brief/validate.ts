import { BRIEF_LIMITS, type BriefInput, type BriefMetric, type BriefOutput } from './types';

export class BriefError extends Error {
  constructor(
    readonly code: 'bad_input' | 'bad_output',
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
  }
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

// ---------------------------------------------------------------- numbers

const DEVANAGARI = '०१२३४५६७८९';

/** Digits written in Devanagari become ordinary digits, so Hindi text is checked the same way as English. */
function normaliseDigits(text: string): string {
  let out = '';
  for (const ch of text) {
    const i = DEVANAGARI.indexOf(ch);
    out += i >= 0 ? String(i) : ch;
  }
  return out;
}

/** Canonical key for a number: no trailing zeros, no float noise. */
function key(n: number): string {
  return String(Number(n.toFixed(6)));
}

/** Every number written in the text, as a list of values. "1,234" is 1234. */
export function extractNumbers(text: string): number[] {
  const cleaned = normaliseDigits(text).replace(/(?<=\d),(?=\d{3}(?!\d))/g, '');
  const out: number[] = [];
  for (const m of cleaned.matchAll(/\d+(?:\.\d+)?/g)) out.push(Number(m[0]));
  return out;
}

function collectNumbers(value: unknown, into: number[]): void {
  if (typeof value === 'number' && Number.isFinite(value)) into.push(value);
  else if (typeof value === 'string') into.push(...extractNumbers(value));
  else if (Array.isArray(value)) for (const v of value) collectNumbers(v, into);
  else if (isRec(value)) for (const v of Object.values(value)) collectNumbers(v, into);
}

/**
 * Numbers the brief may contain: every number in the input (including digits inside names such as "NH107"),
 * plus each rounded to a whole number or one decimal. Nothing computed from them is allowed.
 */
export function allowedNumbers(input: BriefInput): Set<string> {
  const raw: number[] = [];
  collectNumbers(input, raw);
  const allowed = new Set<string>();
  for (const n of raw) {
    allowed.add(key(n));
    allowed.add(key(Math.round(n)));
    allowed.add(key(Math.round(n * 10) / 10));
  }
  return allowed;
}

// ----------------------------------------------------------------- input

function cleanText(v: unknown, what: string, max: number): string {
  if (typeof v !== 'string') throw new BriefError('bad_input', `${what} must be text.`);
  // names come from open map data: drop control characters and cap the length
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (s.length > max) throw new BriefError('bad_input', `${what} is longer than ${max} characters.`);
  return s;
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new BriefError('bad_input', `${what} must be a number.`);
  return v;
}

function nullableNum(v: unknown, what: string): number | null {
  return v === null ? null : num(v, what);
}

/** Checks a request body strictly and returns a clean copy. Throws BriefError('bad_input') otherwise. */
export function parseBriefInput(json: unknown): BriefInput {
  if (!isRec(json)) throw new BriefError('bad_input', 'The request must be a JSON object.');
  const language = json.language;
  if (language !== 'en' && language !== 'hi') throw new BriefError('bad_input', 'language must be "en" or "hi".');

  const s = json.scenario;
  if (!isRec(s) || s.type !== 'landslide') throw new BriefError('bad_input', 'scenario must describe a landslide.');
  if (s.destinations !== 'emergency' && s.destinations !== 'primary') {
    throw new BriefError('bad_input', 'scenario.destinations must be "emergency" or "primary".');
  }

  const m = json.metrics;
  if (!isRec(m) || Object.keys(m).length === 0 || Object.keys(m).length > BRIEF_LIMITS.maxMetrics) {
    throw new BriefError('bad_input', 'metrics must be a non-empty object of reasonable size.');
  }
  const metrics: Record<string, BriefMetric> = {};
  for (const [k, v] of Object.entries(m)) {
    if (!/^[a-z0-9_]{1,48}$/.test(k)) throw new BriefError('bad_input', `metric key "${k}" is not allowed.`);
    if (!isRec(v)) throw new BriefError('bad_input', `metric ${k} must be an object.`);
    if (v.tag !== 'data' && v.tag !== 'assumption') throw new BriefError('bad_input', `metric ${k}: tag must be "data" or "assumption".`);
    metrics[k] = {
      value: nullableNum(v.value, `metric ${k}.value`),
      unit: cleanText(v.unit, `metric ${k}.unit`, 24),
      tag: v.tag,
      label: cleanText(v.label, `metric ${k}.label`, 80),
    };
  }

  if (!Array.isArray(json.top_affected) || json.top_affected.length > BRIEF_LIMITS.maxTopAffected) {
    throw new BriefError('bad_input', 'top_affected must be a short list.');
  }
  const top_affected = json.top_affected.map((t, i) => {
    const status = isRec(t) ? t.status : undefined;
    if (!isRec(t) || (status !== 'cut_off' && status !== 'delayed')) {
      throw new BriefError('bad_input', `top_affected[${i}] is invalid.`);
    }
    return {
      place: cleanText(t.place, `top_affected[${i}].place`, BRIEF_LIMITS.name),
      status: status as 'cut_off' | 'delayed', // checked just above
      before_min: nullableNum(t.before_min, `top_affected[${i}].before_min`),
      after_min: nullableNum(t.after_min, `top_affected[${i}].after_min`),
    };
  });

  const g = json.data_gaps;
  if (!isRec(g)) throw new BriefError('bad_input', 'data_gaps is required.');

  if (!Array.isArray(json.assumptions) || json.assumptions.length > BRIEF_LIMITS.maxAssumptions) {
    throw new BriefError('bad_input', 'assumptions must be a short list.');
  }
  const assumptions = json.assumptions.map((a, i) => {
    if (!isRec(a)) throw new BriefError('bad_input', `assumptions[${i}] is invalid.`);
    return {
      label: cleanText(a.label, `assumptions[${i}].label`, 80),
      value: cleanText(a.value, `assumptions[${i}].value`, 24),
      unit: cleanText(a.unit, `assumptions[${i}].unit`, 24),
    };
  });

  return {
    language,
    scenario: {
      type: 'landslide',
      severity: cleanText(s.severity, 'scenario.severity', 24),
      road: cleanText(s.road, 'scenario.road', BRIEF_LIMITS.name),
      road_class: cleanText(s.road_class, 'scenario.road_class', 24),
      length_km: num(s.length_km, 'scenario.length_km'),
      reopens_after_h: num(s.reopens_after_h, 'scenario.reopens_after_h'),
      destinations: s.destinations,
      threshold_min: num(s.threshold_min, 'scenario.threshold_min'),
    },
    metrics,
    top_affected,
    data_gaps: {
      places_off_road: num(g.places_off_road, 'data_gaps.places_off_road'),
      places_no_route_before: num(g.places_no_route_before, 'data_gaps.places_no_route_before'),
    },
    assumptions,
  };
}

// ---------------------------------------------------------------- output

function textList(v: unknown, what: string, max: number, maxLen: number, min = 1): { items: string[]; issues: string[] } {
  const issues: string[] = [];
  if (!Array.isArray(v)) return { items: [], issues: [`${what} must be a list.`] };
  if (v.length < min || v.length > max) issues.push(`${what} needs ${min} to ${max} items.`);
  const items: string[] = [];
  v.slice(0, max).forEach((x, i) => {
    if (typeof x !== 'string' || x.trim() === '') issues.push(`${what}[${i}] must be non-empty text.`);
    else if (x.length > maxLen) issues.push(`${what}[${i}] is longer than ${maxLen} characters.`);
    else items.push(x.trim());
  });
  return { items, issues };
}

/**
 * Checks a model answer against the schema and against the input. Throws BriefError('bad_output') listing
 * every problem, so the model can be asked to correct them. Returns a clean copy when it passes.
 */
export function validateBrief(raw: unknown, input: BriefInput): BriefOutput {
  const issues: string[] = [];
  if (!isRec(raw)) throw new BriefError('bad_output', 'The answer is not a JSON object.', ['The answer is not a JSON object.']);

  let summary = '';
  if (typeof raw.summary !== 'string' || raw.summary.trim() === '') issues.push('summary must be non-empty text.');
  else if (raw.summary.length > BRIEF_LIMITS.summary) issues.push(`summary is longer than ${BRIEF_LIMITS.summary} characters.`);
  else summary = raw.summary.trim();

  const risks = textList(raw.key_risks, 'key_risks', BRIEF_LIMITS.maxRisks, BRIEF_LIMITS.risk);
  const caveats = textList(raw.caveats, 'caveats', BRIEF_LIMITS.maxCaveats, BRIEF_LIMITS.caveat);
  issues.push(...risks.issues, ...caveats.issues);

  const actions: BriefOutput['recommended_actions'] = [];
  if (!Array.isArray(raw.recommended_actions) || raw.recommended_actions.length < 1 || raw.recommended_actions.length > BRIEF_LIMITS.maxActions) {
    issues.push(`recommended_actions needs 1 to ${BRIEF_LIMITS.maxActions} items.`);
  } else {
    raw.recommended_actions.forEach((a, i) => {
      if (!isRec(a) || typeof a.action !== 'string' || typeof a.rationale !== 'string' || !Array.isArray(a.metric_refs)) {
        issues.push(`recommended_actions[${i}] needs action, rationale and metric_refs.`);
        return;
      }
      if (a.action.trim() === '' || a.action.length > BRIEF_LIMITS.action) issues.push(`recommended_actions[${i}].action is empty or too long.`);
      if (a.rationale.trim() === '' || a.rationale.length > BRIEF_LIMITS.rationale) issues.push(`recommended_actions[${i}].rationale is empty or too long.`);
      const refs = a.metric_refs.filter((r): r is string => typeof r === 'string');
      if (refs.length === 0) issues.push(`recommended_actions[${i}] must cite at least one metric in metric_refs.`);
      for (const r of refs) {
        if (!(r in input.metrics)) issues.push(`recommended_actions[${i}] cites "${r}", which is not a metric key.`);
      }
      actions.push({ action: a.action.trim(), rationale: a.rationale.trim(), metric_refs: refs });
    });
  }

  // the number check: every figure in every text field must come from the input
  const allowed = allowedNumbers(input);
  const alltext = [summary, ...risks.items, ...caveats.items, ...actions.flatMap((a) => [a.action, a.rationale])];
  const stray = new Set<string>();
  for (const t of alltext) {
    for (const n of extractNumbers(t)) if (!allowed.has(key(n))) stray.add(key(n));
  }
  if (stray.size > 0) {
    issues.push(
      `These numbers do not appear in the input and must be removed or replaced with numbers from it: ${[...stray].join(', ')}.`,
    );
  }

  if (issues.length > 0) throw new BriefError('bad_output', `The answer failed validation: ${issues.join(' ')}`, issues);
  return { summary, key_risks: risks.items, recommended_actions: actions, caveats: caveats.items };
}
