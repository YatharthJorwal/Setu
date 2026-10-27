import { describe, expect, it } from 'vitest';
import { buildReportHtml, escapeHtml } from './buildReport';
import { sampleReport } from './fixtures';

describe('escapeHtml', () => {
  it('escapes the five characters that matter', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
    expect(escapeHtml('plain text 142')).toBe('plain text 142');
  });
});

describe('buildReportHtml', () => {
  const html = buildReportHtml(sampleReport());

  it('contains the scenario, the numbers and the labels that say what kind of number each is', () => {
    for (const s of ['Landslide scenario report', 'NH107', 'Major', '142', '331', '340', '79', '85', 'Marana', 'Utrasu', '95 to 132', '2026-10-26 14:05 UTC']) {
      expect(html).toContain(s);
    }
    expect(html).toContain('class="tag data"');
    expect(html).toContain('class="tag assumption"');
  });

  it('carries the not-a-warning-system notice, the assumptions, the sources and the run record', () => {
    expect(html).toContain('Not an operational warning system');
    expect(html).toContain('Average speed on trunk roads');
    expect(html).toContain('OpenStreetMap');
    expect(html).toContain('Hill road attributes are sparse');
    expect(html).toContain('&quot;simVersion&quot;');
  });

  it('shows the brief with who wrote it, or says none was written', () => {
    expect(html).toContain('Stage an ambulance on the cut-off side.');
    expect(html).toContain('running on this computer');
    const none = buildReportHtml(sampleReport({ brief: null }));
    expect(none).toContain('No brief was generated');
    expect(none).not.toContain('Stage an ambulance');
  });

  it('cannot be turned against the reader: no scripts, no outside requests, every name escaped', () => {
    const evil = buildReportHtml(
      sampleReport({
        worst: [{ place: '<img src=x onerror=alert(1)>', status: 'cut_off', detail: '<script>alert(2)</script>' }],
        scenario: { ...sampleReport().scenario, road: '"><script>alert(3)</script>' },
      }),
    );
    expect(evil).not.toContain('<script');
    expect(evil).not.toContain('<img src=x');
    expect(evil).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(evil).toContain("default-src 'none'");
    expect(evil).not.toMatch(/<(img|link|script|iframe)[^>]+(src|href)="https?:/i);
  });

  it('accepts only an inline image for the map', () => {
    expect(html).toContain('<img class="map"');
    expect(buildReportHtml(sampleReport({ screenshot: null }))).not.toContain('<img');
    expect(buildReportHtml(sampleReport({ screenshot: 'https://evil.example/x.jpg' }))).not.toContain('<img');
    expect(buildReportHtml(sampleReport({ screenshot: 'data:text/html;base64,PHNjcmlwdD4=' }))).not.toContain('<img');
    expect(buildReportHtml(sampleReport({ screenshot: 'data:image/jpeg;base64,AAA" onerror="x' }))).not.toContain('<img');
  });

  it('is print-ready: A4 page rules and a hint that is hidden on paper', () => {
    expect(html).toContain('@page { size: A4');
    expect(html).toContain('@media print { .hint { display: none; }');
  });
});
