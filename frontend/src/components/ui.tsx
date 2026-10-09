import type { ReactNode } from "react";
import Link from "next/link";

// Shared field styling for every form on the site (BuildingForm, UnitForm,
// AmenityMultiSelect, ...): a filled, borderless input rather than a bordered
// one, so it stays in one place instead of drifting per-form.
export const fieldInputClass =
  "w-full rounded-xl border border-transparent bg-input-bg px-3.5 py-2.5 text-sm text-foreground placeholder:text-placeholder transition focus:border-accent focus:bg-surface focus:outline-none";
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
    <div id={id} className={`rounded-[18px] border border-border/70 bg-surface p-6 shadow-card ${className}`}>
      {children}
    </div>
  );
}

export function StatTile({ label, value, tone = "default" }: { label: string; value: ReactNode; tone?: "default" | "accent" | "warn" }) {
  const valueColor = tone === "accent" ? "text-accent" : tone === "warn" ? "text-amber-600" : "text-foreground";
  return (
    <div className="rounded-[18px] border border-border/70 bg-surface p-6 shadow-card">
      <div className="text-sm text-muted">{label}</div>
      <div className={`mt-2 text-3xl font-semibold tracking-tight ${valueColor}`}>{value}</div>
    </div>
  );
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "accent" | "warn" | "danger" | "success" }) {
  const toneClasses: Record<string, string> = {
    default: "bg-input-bg text-muted",
    accent: "bg-accent/10 text-accent",
    warn: "bg-amber-500/10 text-amber-700",
    danger: "bg-red-500/10 text-red-700",
    success: "bg-success-bg text-success-foreground",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}

/** Page title block. The back link sits above the title as a breadcrumb, the
 * actions sit on the right; an eyebrow is plain small text (the section a
 * page belongs to), not a shouted label. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  showHomeLink = true,
  backHref = "/buildings",
  backLabel = "Library",
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Pass `false` on top-level pages (the sidebar is already the way back). */
  showHomeLink?: boolean;
  /** Where the back link points — defaults to the building library, but a
   * client-scoped page (new/edit client) should point back to /clients. */
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-8">
      {showHomeLink && (
        <Link
          href={backHref}
          className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {backLabel.replace(/^Back to /i, "").replace(/^./, (c) => c.toUpperCase())}
        </Link>
      )}
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div className="min-w-0">
          {eyebrow && <p className="mb-1.5 text-sm font-medium text-muted">{eyebrow}</p>}
          <h1 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] text-balance sm:text-[38px]">{title}</h1>
          {description && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgb(15_27_51/0.45)] p-4 backdrop-blur-[2px]"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-[20px] bg-surface p-6 shadow-float"
      >
        <h2 id="confirm-dialog-title" className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        {message && <p className="mt-2 text-sm leading-relaxed text-muted">{message}</p>}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
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
    primary: "bg-dark text-white hover:bg-dark/90",
    secondary: "bg-accent text-accent-foreground hover:bg-accent/90",
    ghost: "border border-border bg-surface text-foreground hover:bg-input-bg",
  };
  return (
    <button
      {...props}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

/** Link styled as a Button — so a navigation isn't a <button> nested in an
 * <a> (invalid HTML, and two tab stops for one action). */
export function ButtonLink({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  const variants: Record<string, string> = {
    primary: "bg-dark text-white hover:bg-dark/90",
    secondary: "bg-accent text-accent-foreground hover:bg-accent/90",
    ghost: "border border-border bg-surface text-foreground hover:bg-input-bg",
  };
  return (
    <Link
      href={href}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors ${variants[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

/** A grey stand-in where a building has no captured photo yet. */
export function PhotoPlaceholder({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center bg-input-bg text-muted ${className}`}>
      <svg width="22" height="22" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden="true">
        <rect x="1.5" y="2.5" width="11" height="9" rx="1.5" />
        <path d="M1.5 9.5l3-3 3 3 2-2 3 3" />
      </svg>
      <span className="sr-only">No photo yet</span>
    </div>
  );
}
