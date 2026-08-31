import { AlertCircle, Inbox, LoaderCircle, RotateCcw } from "lucide-react";

type StateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
};

function State({ title, description, actionLabel, onAction, icon: Icon }: StateProps & { icon: typeof Inbox }) {
  return (
    <section className="async-state" aria-live="polite">
      <Icon aria-hidden="true" size={22} />
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
    <div className="async-state" role="status">
      <LoaderCircle className="spinner" aria-hidden="true" size={22} />
      <strong>{label}</strong>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <State
      icon={AlertCircle}
      title="داده این بخش در دسترس نیست"
      description={error instanceof Error ? error.message : "دوباره تلاش کنید."}
      actionLabel={onRetry ? "تلاش دوباره" : undefined}
      onAction={onRetry}
    />
  );
}

export function EmptyState({ title, description }: Pick<StateProps, "title" | "description">) {
  return <State icon={Inbox} title={title} description={description} />;
}
