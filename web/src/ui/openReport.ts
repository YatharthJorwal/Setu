import { buildReportHtml } from '../report/buildReport';
import { captureScreenshot } from '../state/capture';
import { assembleReportData } from '../state/report';
import { useSceneStore } from '../state/store';

/** Builds the report for the current scenario and opens it in a new tab, to print or save as PDF. */
export function openReport(): void {
  const s = useSceneStore.getState();
  if (!s.graph || !s.run || !s.assets || s.scenario.edge === null) return;

  const data = assembleReportData({
    graph: s.graph,
    run: s.run,
    scenario: s.scenario,
    brief: s.brief,
    provenance: s.assets.provenance,
    now: new Date(),
    screenshot: captureScreenshot(),
  });
  const url = URL.createObjectURL(new Blob([buildReportHtml(data)], { type: 'text/html' }));
  const win = window.open(url, '_blank');
  if (!win) {
    // a pop-up blocker stopped the new tab: save the page as a file instead
    const a = document.createElement('a');
    a.href = url;
    a.download = 'setu-report.html';
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
