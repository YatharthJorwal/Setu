import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '../lib/i18n';

interface Props {
  children: ReactNode;
}
interface State {
  failed: boolean;
}

/** Catches rendering failures (most commonly WebGL being unavailable) and says so plainly. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Scene failed to render', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className="message" role="alert">
          {t('status.webgl')}
        </div>
      );
    }
    return this.props.children;
  }
}
