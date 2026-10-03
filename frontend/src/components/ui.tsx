import type { ReactNode } from "react";
import Link from "next/link";

// Shared field styling for every form on the site (BuildingForm, UnitForm,
// AmenityMultiSelect, ...): a filled, borderless input rather than a bordered
// one, so it stays in one place instead of drifting per-form.
export const fieldInputClass =
  "w-full rounded-[10px] border border-transparent bg-input-bg px-3.5 py-2.5 text-sm text-foreground placeholder:text-placeholder transition focus:border-accent focus:bg-surface focus:outline-none";
export const fieldLabelClass = "text-sm font-medium";

export function Card({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  /** Anchor target for an in-page section nav (see BuildingForm's sticky rail). */
  id?: string;
}) {
  return (
    <div id={id} className={`rounded-2xl border border-border bg-surface p-6 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function StatTile({ label, value, tone = "default" }: { label: string; value: ReactNode; tone?: "default" | "accent" | "warn" }) {
  const valueColor = tone === "accent" ? "text-accent" : tone === "warn" ? "text-amber-500" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-2 text-3xl font-bold ${valueColor}`}>{value}</div>
    </div>
  );
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "accent" | "warn" | "danger" | "success" }) {
  const toneClasses: Record<string, string> = {
    default: "bg-border/60 text-muted",
    accent: "bg-accent/10 text-accent",
    warn: "bg-amber-500/10 text-amber-600",
    danger: "bg-red-500/10 text-red-600",
    success: "bg-emerald-500/10 text-emerald-600",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  showHomeLink = true,
  backHref = "/buildings",
  backLabel = "Back to building library",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Every page but the dashboard itself shows this by default — pass
   * `false` on the dashboard page, since "back to Dashboard" makes no
   * sense from the Dashboard. */
  showHomeLink?: boolean;
  /** Where the back link points — defaults to the building library, but a
   * client-scoped page (new/edit client) should point back to /clients. */
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-5 border-b border-border pb-7 sm:flex-row sm:items-end">
      <div>
        {eyebrow && (
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-accent">
            <span className="h-2 w-2 shrink-0 rounded-sm bg-accent" />
            {eyebrow}
          </div>
        )}
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-muted">{description}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        {actions}
        {showHomeLink && (
          <Link href={backHref} className="text-xs font-semibold text-accent hover:underline">
            {backLabel} →
          </Link>
        )}
      </div>
    </div>
  );
}

/** A yes/no confirmation, rendered in place of the browser's own
 * window.confirm() so it can carry the app's styling and show an inline
 * error if the confirmed action fails instead of just alerting. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Yes",
  cancelLabel = "No",
  onConfirm,
  onCancel,
  busy = false,
  error,
}: {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-lg"
      >
        <h2 id="confirm-dialog-title" className="text-lg font-semibold">
          {title}
        </h2>
        {message && <p className="mt-2 text-sm text-muted">{message}</p>}
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button type="button" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  const variants: Record<string, string> = {
    primary: "bg-dark text-white hover:opacity-90",
    secondary: "bg-accent text-accent-foreground hover:opacity-90",
    ghost: "border border-border text-foreground hover:bg-border/40",
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}
