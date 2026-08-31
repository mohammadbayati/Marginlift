import { type ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";

type DrawerProps = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
};

export function Drawer({ open, title, description, children, onClose }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("drawer-open");
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("drawer-open");
      previous?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div className="drawer-layer">
      <button className="drawer-backdrop" type="button" aria-label="بستن پنل" onClick={onClose} />
      <div ref={panelRef} className="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="drawer-title" tabIndex={-1}>
        <header className="drawer-header">
          <div>
            <span className="eyebrow">Decision Receipt</span>
            <h2 id="drawer-title">{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="بستن">
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </div>
    </div>
  );
}
