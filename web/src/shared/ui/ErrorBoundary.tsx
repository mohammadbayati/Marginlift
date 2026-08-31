import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { failed: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("MarginLift render failed", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="fatal-state" dir="rtl">
        <span className="eyebrow">خطای نمایش</span>
        <h1>این صفحه کامل بارگذاری نشد.</h1>
        <p>داده‌ای تغییر نکرده است. صفحه را دوباره بارگذاری کنید.</p>
        <button className="button button-primary" type="button" onClick={() => window.location.reload()}>بارگذاری دوباره</button>
      </main>
    );
  }
}
