import type { BriefResult } from '../brief';
import { t, type Key } from '../lib/i18n';
import { destinationLabel, severityLabel } from '../lib/labels';
import type { ProvenanceEntry } from '../lib/types';
import type { ReportData } from '../report/types';
import { ASSUMPTIONS, edgeSummary, clearanceHours, type RoadGraph, type RunResult, type SetMetrics, type TargetSet } from './sim-api';
import type { BriefState, ScenarioSettings } from './store';

const fmtN = (n: number): string => n.toLocaleString('en');
const minutes = (v: number | null): string => (v === null ? '-' : String(Math.round(v)));

/** How many people are cut off, said honestly: unknown, partly known, or known. */
export function describePeople(m: SetMetrics): string {
  if (m.places_isolated === 0) return '0';
  const share = m.population.known_share_isolated;
  if (share === 0) return t('dash.peopleUnknown');
  if (share < 1) return t('dash.peoplePartial', { n: fmtN(m.population.isolated), pct: Math.round(share * 100) });
  return fmtN(m.population.isolated);
}

/** When access returns for the places the slide cut off, or null when nobody was cut off. */
export function describeRestored(run: RunResult, set: TargetSet, snapshot: number, m: SetMetrics): string | null {
  if (m.places_isolated === 0 && snapshot === 0) return null;
  const restored = run.restoredAfter_h[set].filter((h): h is number => h !== null);
  if (restored.length === 0) return t('dash.never');
  const lo = Math.min(...restored);
  const hi = Math.max(...restored);
  return lo === hi ? t('dash.restoredOne', { h: lo }) : t('dash.restored', { min: lo, max: hi });
}

const REASON_KEY: Record<NonNullable<BriefResult['reason']>, Key> = {
  no_key: 'brief.reason.no_key',
  unreachable: 'brief.reason.unreachable',
  invalid: 'brief.reason.invalid',
  language: 'brief.reason.language',
  error: 'brief.reason.error',
};

/** The line under a brief that says who wrote it: an AI model (and where it ran) or the template, and why. */
export function briefSourceNote(result: BriefResult, language: 'en' | 'hi' | undefined): string {
  if (result.source === 'ai') {
    if (!result.model) return t('brief.sourceAiNoModel');
    return t(result.provider === 'ollama' ? 'brief.sourceLocal' : 'brief.sourceAi', { model: result.model });
  }
  let note = t('brief.sourceTemplate', { reason: t(REASON_KEY[result.reason ?? 'error']) });
  if (language === 'hi') note += ` ${t('brief.englishOnly')}`;
  if (result.detail) note += ` ${t('brief.detail', { detail: result.detail })}`;
  return note;
}

interface AssembleArgs {
  graph: RoadGraph;
  run: RunResult;
  scenario: ScenarioSettings;
  brief: BriefState;
  provenance: ProvenanceEntry[];
  now: Date;
  /** a data: URL of the map, or null */
  screenshot: string | null;
}

/** Collects everything the printable report shows, as plain text. */
export function assembleReportData(a: AssembleArgs): ReportData {
  if (a.scenario.edge === null) throw new Error('There is no scenario to report on.');
  const summary = edgeSummary(a.graph, a.scenario.edge);
  const set = a.scenario.targetSet;
  const snap = a.run.snapshots[a.scenario.snapshot] ?? a.run.snapshots[0];
  const m = snap[set];
  const T = a.scenario.tGoldenMin;
  const places = t('dash.kpi.places');
  const hoursOf = Math.round((snap.t_s / 3600) * 10) / 10;

  const result = a.brief.status === 'ready' ? a.brief.result : null;
  const labelOf = (key: string): string => a.brief.input?.metrics[key]?.label ?? key;

  return {
    generatedAt: `${a.now.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    scenario: {
      road: summary.name,
      roadDetail: `${summary.className} road, ${summary.length_km} km${summary.bridge ? `, ${t('scenario.bridge')}` : ''}`,
      severity: severityLabel(a.scenario.severity),
      reopens: t('report.hours', { n: clearanceHours(summary.className, a.scenario.severity) }),
      destinations: destinationLabel(set),
      threshold: t('report.minutes', { n: T }),
      moment: a.scenario.snapshot === 0 ? t('dash.timeEvent') : t('dash.timeAfter', { hours: hoursOf }),
    },
    kpis: [
      { label: `${t('dash.kpi.cutOff')} (${places})`, tag: 'data', before: '0', after: fmtN(m.places_isolated) },
      {
        label: `${t('dash.kpi.delayed', { n: T })} (${places})`,
        tag: 'assumption',
        before: fmtN(m.places_delayed_before),
        after: fmtN(m.places_delayed),
      },
      {
        label: `${t('dash.kpi.typical')} (${t('dash.kpi.unit')})`,
        tag: 'assumption',
        before: minutes(m.median_before_min),
        after: minutes(m.median_after_min),
      },
    ],
    people: describePeople(m),
    restored: describeRestored(a.run, set, a.scenario.snapshot, m),
    worst: m.worst.map((w) => {
      const place = a.graph.places[w.place].name || t('dash.unnamedPlace');
      if (w.status === 'isolated') return { place, status: 'cut_off' as const, detail: t('dash.cutOffShort') };
      const added = Math.round(w.after_min - w.before_min);
      return {
        place,
        status: 'delayed' as const,
        detail: `${t('dash.delayedShort', { n: added })}, ${minutes(w.before_min)} to ${minutes(w.after_min)} ${t('dash.kpi.unit')}`,
      };
    }),
    notCounted: `${t('dash.typicalNote')} ${t('dash.notCounted', { a: fmtN(m.places_unconnected), b: fmtN(m.places_no_baseline) })}`,
    brief: result
      ? {
          kind: result.source,
          summary: result.brief.summary,
          risks: result.brief.key_risks,
          actions: result.brief.recommended_actions.map((x) => ({
            action: x.action,
            rationale: x.rationale,
            metrics: x.metric_refs.map(labelOf),
          })),
          caveats: result.brief.caveats,
          sourceNote: briefSourceNote(result, a.brief.input?.language),
        }
      : null,
    assumptions: ASSUMPTIONS.map((x) => ({ label: x.label, value: x.value, unit: x.unit })),
    sources: a.provenance.map((p) => ({
      dataset: p.dataset,
      licence: p.licence,
      retrieved: p.retrieved_on,
      coverage: p.coverage_note,
      gaps: p.gaps,
    })),
    screenshot: a.screenshot,
    notice: t('app.notice'),
    credits: [t('credits.osm'), t('credits.dem')],
    record: JSON.stringify(a.run.record, null, 2),
  };
}
