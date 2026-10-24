import { t } from '../lib/i18n';

/** Marks a number as measured data or as a modelled assumption (RULES P3). */
export function Tag({ kind }: { kind: 'data' | 'assumption' }) {
  return <span className={`tag tag-${kind}`}>{t(kind === 'data' ? 'tag.data' : 'tag.assumption')}</span>;
}
