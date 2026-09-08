import { AlertCircle, Inbox, LoaderCircle, RotateCcw } from "lucide-react";

type StateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
};

function State({ title, description, actionLabel, onAction, icon: Icon, tone }: StateProps & { icon: typeof Inbox; tone: "empty" | "error" }) {
  return (
    <section className={`async-state is-${tone}`} aria-live="polite">
      <span className="state-icon"><Icon aria-hidden="true" size={22} /></span>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {actionLabel && onAction ? (
        <button className="button button-secondary" type="button" onClick={onAction}>
          <RotateCcw aria-hidden="true" size={17} />
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}

export function LoadingState({ label = "در حال دریافت داده…" }: { label?: string }) {
  return (
    <div className="async-state is-loading" role="status">
      <span className="state-icon"><LoaderCircle className="spinner" aria-hidden="true" size={22} /></span>
      <div><strong>{label}</strong><p>اطلاعات معتبر در حال همگام‌سازی است.</p></div>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <State
      icon={AlertCircle}
      tone="error"
      title="داده این بخش در دسترس نیست"
      description={error instanceof Error ? error.message : "دوباره تلاش کنید."}
      actionLabel={onRetry ? "تلاش دوباره" : undefined}
      onAction={onRetry}
    />
  );
}

export function EmptyState({ title, description }: Pick<StateProps, "title" | "description">) {
  return <State icon={Inbox} tone="empty" title={title} description={description} />;
}
