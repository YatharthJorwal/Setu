import { useState } from 'react';
import type { BriefLanguage } from '../brief';
import { t } from '../lib/i18n';
import { briefSourceNote } from '../state/report';
import { useSceneStore } from '../state/store';
import { Segmented } from './Segmented';

/** The AI situation brief, with a rule-based fallback that is always labelled as such. */
export function BriefPanel() {
  const brief = useSceneStore((s) => s.brief);
  const requestBrief = useSceneStore((s) => s.requestBrief);
  const [language, setLanguage] = useState<BriefLanguage>('en');

  const loading = brief.status === 'loading';
  const result = brief.status === 'ready' ? brief.result : null;
  const label = (key: string): string => brief.input?.metrics[key]?.label ?? key;

  return (
    <section className="brief">
      <div className="eyebrow">{t('brief.title')}</div>
      <p className="small muted">{t('brief.hint')}</p>

      <div className="brief-controls">
        <Segmented<BriefLanguage>
          name="brieflang"
          legend={t('brief.language')}
          options={[
            { value: 'en', label: t('brief.langEn') },
            { value: 'hi', label: t('brief.langHi') },
          ]}
          value={language}
          onChange={setLanguage}
        />
        <button type="button" className="btn btn-primary" disabled={loading} onClick={() => void requestBrief(language)}>
          {result ? t('brief.rewrite') : t('brief.write')}
        </button>
      </div>

      {loading && (
        <div role="status" aria-label={t('brief.loading')} className="skeleton">
          <span />
          <span />
          <span className="short" />
        </div>
      )}

      {result && (
        <article className="brief-body fade-in">
          <p className="brief-summary">{result.brief.summary}</p>

          <h3>{t('brief.risks')}</h3>
          <ul className="bullets">
            {result.brief.key_risks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>

          <h3>{t('brief.actions')}</h3>
          <ol className="actions">
            {result.brief.recommended_actions.map((a) => (
              <li key={a.action}>
                <strong>{a.action}</strong>
                <span className="small muted">{a.rationale}</span>
                <span className="chips">
                  {a.metric_refs.map((m) => (
                    <span key={m} className="chip">
                      {label(m)}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ol>

          <h3>{t('brief.caveats')}</h3>
          <ul className="bullets small muted">
            {result.brief.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>

          <p className={result.source === 'ai' ? 'source ai' : 'source template'}>
            {briefSourceNote(result, brief.input?.language)}
          </p>
        </article>
      )}
    </section>
  );
}
