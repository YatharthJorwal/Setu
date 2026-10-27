import { t } from './i18n';

export function severityLabel(severity: string): string {
  switch (severity) {
    case 'minor':
      return t('scenario.severity.minor');
    case 'major':
      return t('scenario.severity.major');
    case 'severe':
      return t('scenario.severity.severe');
    default:
      return severity;
  }
}

export function destinationLabel(set: string): string {
  return set === 'primary' ? t('scenario.dest.primary') : t('scenario.dest.emergency');
}
