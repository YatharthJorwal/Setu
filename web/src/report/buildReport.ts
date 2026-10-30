import { t } from '../lib/i18n';
import type { ReportData } from './types';

/** Escapes text for HTML. Place and road names come from open map data, so every value goes through this. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const e = escapeHtml;
const tag = (kind: 'data' | 'assumption'): string =>
  `<span class="tag ${kind}">${e(t(kind === 'data' ? 'tag.data' : 'tag.assumption'))}</span>`;

/** Only inline image data is allowed in the page; anything else is dropped. */
function safeImage(src: string | null): string | null {
  return src !== null && /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(src) ? src : null;
}

const STYLE = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font: 11pt/1.45 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #15191e; margin: 0; padding: 24px; max-width: 880px; margin-inline: auto; }
  h1 { font-size: 22pt; margin: 0 0 2pt; letter-spacing: -0.01em; }
  h2 { font-size: 12pt; margin: 20pt 0 6pt; padding-bottom: 3pt; border-bottom: 1px solid #c9d0d8; text-transform: uppercase; letter-spacing: 0.06em; color: #3a4654; }
  h3 { font-size: 10pt; margin: 10pt 0 3pt; text-transform: uppercase; letter-spacing: 0.06em; color: #5a6675; }
  p { margin: 0 0 6pt; }
  .sub { color: #5a6675; margin-bottom: 10pt; }
  .notice { border: 1.5px solid #15191e; padding: 7pt 10pt; font-size: 10pt; margin: 10pt 0 14pt; }
  img.map { width: 100%; border: 1px solid #c9d0d8; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; margin: 4pt 0 8pt; page-break-inside: avoid; }
  th, td { text-align: left; padding: 4pt 6pt; border-bottom: 1px solid #dde2e8; vertical-align: top; }
  th { font-weight: 600; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .tag { display: inline-block; font-size: 7.5pt; padding: 0 4pt; border: 1px solid currentColor; border-radius: 8pt; text-transform: uppercase; letter-spacing: 0.05em; vertical-align: 1pt; }
  .tag.data { color: #0b5d8f; }
  .tag.assumption { color: #8a5a00; }
  ul, ol { margin: 0 0 6pt; padding-left: 16pt; }
  li { margin-bottom: 3pt; }
  .action { border: 1px solid #dde2e8; border-radius: 4px; padding: 6pt 8pt; margin-bottom: 6pt; page-break-inside: avoid; }
  .action .why { color: #4a5563; font-size: 10pt; }
  .chip { display: inline-block; font-size: 8.5pt; border: 1px solid #b5bdc7; border-radius: 8pt; padding: 0 5pt; margin: 3pt 3pt 0 0; color: #3a4654; }
  .source { font-size: 9.5pt; color: #4a5563; border-left: 3px solid #c9d0d8; padding-left: 8pt; margin-top: 6pt; }
  .small { font-size: 9pt; color: #5a6675; }
  pre { font: 8.5pt/1.4 ui-monospace, Consolas, monospace; background: #f3f5f7; padding: 8pt; overflow-x: auto; white-space: pre-wrap; border-radius: 4px; }
  .hint { color: #5a6675; font-size: 9.5pt; margin-bottom: 8pt; }
  @media print { .hint { display: none; } body { padding: 0; } }
`;

function briefSection(data: ReportData): string {
  const b = data.brief;
  if (!b) return `<p>${e(t('report.noBrief'))}</p>`;
  return `
    <p>${e(b.summary)}</p>
    <h3>${e(t('brief.risks'))}</h3>
    <ul>${b.risks.map((r) => `<li>${e(r)}</li>`).join('')}</ul>
    <h3>${e(t('brief.actions'))}</h3>
    ${b.actions
      .map(
        (a) => `<div class="action"><strong>${e(a.action)}</strong><div class="why">${e(a.rationale)}</div>${a.metrics
          .map((m) => `<span class="chip">${e(m)}</span>`)
          .join('')}</div>`,
      )
      .join('')}
    <h3>${e(t('brief.caveats'))}</h3>
    <ul class="small">${b.caveats.map((c) => `<li>${e(c)}</li>`).join('')}</ul>
    <p class="source">${e(b.sourceNote)}</p>`;
}

/**
 * A complete, self-contained HTML page: no scripts, no external requests (the policy in the page forbids both),
 * every value escaped. Opened in a new tab and printed or saved as PDF from there.
 */
export function buildReportHtml(data: ReportData): string {
  const image = safeImage(data.screenshot);
  const s = data.scenario;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<title>${e(t('report.title'))}: ${e(s.road)}</title>
<style>${STYLE}</style>
</head>
<body>
  <p class="hint">${e(t('report.print'))}</p>
  <h1>${e(t('report.title'))}</h1>
  <p class="sub">${e(s.road)} &middot; ${e(t('report.generated', { when: data.generatedAt }))}</p>
  <div class="notice">${e(data.notice)}</div>

  ${image ? `<img class="map" alt="${e(t('report.map'))}" src="${image}">` : ''}

  <h2>${e(t('report.scenario'))}</h2>
  <table>
    <tr><th>${e(t('report.road'))}</th><td>${e(s.road)}, ${e(s.roadDetail)}</td></tr>
    <tr><th>${e(t('report.severity'))}</th><td>${e(s.severity)}</td></tr>
    <tr><th>${e(t('report.reopens'))}</th><td>${e(s.reopens)} ${tag('assumption')}</td></tr>
    <tr><th>${e(t('report.destinations'))}</th><td>${e(s.destinations)}</td></tr>
    <tr><th>${e(t('report.threshold'))}</th><td>${e(s.threshold)} ${tag('assumption')}</td></tr>
    <tr><th>${e(t('report.moment'))}</th><td>${e(s.moment)}</td></tr>
  </table>

  <h2>${e(t('report.results'))}</h2>
  <table>
    <tr><th>${e(t('report.col.measure'))}</th><th class="num">${e(t('report.col.before'))}</th><th class="num">${e(t('report.col.after'))}</th></tr>
    ${data.kpis
      .map((k) => `<tr><td>${e(k.label)} ${tag(k.tag)}</td><td class="num">${e(k.before)}</td><td class="num">${e(k.after)}</td></tr>`)
      .join('')}
  </table>
  <p>${e(t('dash.people'))}: ${e(data.people)}</p>
  ${data.restored ? `<p>${e(data.restored)} ${tag('assumption')}</p>` : ''}
  <p class="small">${e(data.notCounted)}</p>

  ${
    data.worst.length > 0
      ? `<h3>${e(t('report.worst'))}</h3>
  <table>${data.worst.map((w) => `<tr><td>${e(w.place)}</td><td class="num">${e(w.detail)}</td></tr>`).join('')}</table>`
      : ''
  }

  <h2>${e(t('report.brief'))}</h2>
  ${briefSection(data)}

  <h2>${e(t('report.assumptions'))}</h2>
  <table>${data.assumptions
    .map((a) => `<tr><td>${e(a.label)}</td><td class="num">${e(a.value)} ${e(a.unit)}</td></tr>`)
    .join('')}</table>
  <p class="small">${tag('assumption')} ${e(t('dash.caveat'))}</p>

  <h2>${e(t('report.sources'))}</h2>
  ${data.sources
    .map(
      (src) => `<p><strong>${e(src.dataset)}</strong><br>${e(src.licence)}<br><span class="small">${src.retrieved ? `${e(t('report.retrieved', { date: src.retrieved }))}. ` : ''}${e(src.coverage)}</span><br><span class="small">${e(t('data.gaps'))}: ${e(src.gaps)}</span></p>`,
    )
    .join('')}
  ${data.credits.map((c) => `<p class="small">${e(c)}</p>`).join('')}

  <h2>${e(t('report.record'))}</h2>
  <p class="small">${e(t('report.recordNote'))}</p>
  <pre>${e(data.record)}</pre>
</body>
</html>`;
}
