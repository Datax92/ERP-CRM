"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import type { Cell } from "@/lib/modules";
import { navGroupFor } from "./AppShell";

const TONES: Record<NonNullable<Cell["tone"]>, { chip: string; dot: string }> = {
  good: { chip: "bg-good-soft text-good", dot: "bg-good" },
  warn: { chip: "bg-warn-soft text-warn", dot: "bg-warn" },
  bad: { chip: "bg-bad-soft text-bad", dot: "bg-bad" },
  info: { chip: "bg-info-soft text-info", dot: "bg-info" },
  muted: { chip: "bg-surface-2 text-muted ring-1 ring-line ring-inset", dot: "bg-faint" },
};

/** Status chip: a dot plus the word, so state never relies on colour alone. */
export function Badge({ tone = "info", children }: { tone?: Cell["tone"]; children: ReactNode }) {
  const t = TONES[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11.5px] leading-none font-medium whitespace-nowrap ${t.chip}`}>
      <span className={`size-1.5 rounded-full ${t.dot}`} />
      {children}
    </span>
  );
}

export function CellView({ cell, serial }: { cell: Cell; serial?: boolean }) {
  if (cell.tone) return <Badge tone={cell.tone}>{cell.text}</Badge>;
  if (serial && cell.text !== "—") return <span className="serial text-ink">{cell.text}</span>;
  if (cell.subtext) {
    return (
      <div className="inline-block">
        <div>{cell.text}</div>
        <div className="text-[11px] font-normal text-muted">{cell.subtext}</div>
      </div>
    );
  }
  return <>{cell.text}</>;
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: string; actions?: ReactNode; eyebrow?: string }) {
  const pathname = usePathname();
  return (
    <div className="erp-page-header">
      <div className="erp-page-title">
        <span className="sr-only">{eyebrow ?? navGroupFor(pathname)}</span>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="erp-page-actions">{actions}</div>}
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  eyebrow,
  title,
  aside,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  eyebrow?: ReactNode;
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); }
      if (e.key === 'Tab') {
        const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || []).filter((n) => n.getClientRects().length);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (!first) { e.preventDefault(); return; }
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keys);
    return () => { document.removeEventListener('keydown', keys); document.body.style.overflow = overflow; previous?.focus(); };
  }, [open]);
  if (!open || typeof document === "undefined") return null;
  // Portalled to <body> so no transformed ancestor (page transitions) can trap the fixed overlay.
  return createPortal(
    <div className="erp-dialog-overlay fixed inset-0 flex">
      <div className="anim-fade absolute inset-0 bg-[#0a1411]/40 backdrop-blur-[3px]" onClick={onClose} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="erp-dialog anim-drawer relative flex w-full max-w-[1100px] flex-col shadow-[var(--shadow-lg)]">
        <div className="border-b border-line bg-surface px-5 pt-4 pb-4 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
              <div id={titleId} className="drawer-title display truncate leading-tight text-ink">{title}</div>
            </div>
            <button className="btn size-9 shrink-0 !px-0" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
          {aside && <div className="mt-4">{aside}</div>}
        </div>
        <div className="erp-dialog-body flex-1 overflow-y-auto px-5 py-5 sm:px-7">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3 sm:px-7">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card mb-4 p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="eyebrow !text-muted">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center text-sm text-muted">
      <div className="h-px w-10 bg-brass" />
      {children}
    </div>
  );
}
