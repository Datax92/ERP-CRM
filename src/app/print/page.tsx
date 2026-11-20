"use client";

import { Suspense, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { useStore } from "@/components/DataProvider";
import { PRINTABLE, TradeDocument } from "@/components/TradeDocument";
import { MODULES } from "@/lib/modules";
import type { CollectionName } from "@/lib/types";

export default function PrintPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <PrintDocument />
    </Suspense>
  );
}

function PrintDocument() {
  const s = useStore();
  const params = useSearchParams();
  const col = params.get("col") as CollectionName | null;
  const id = params.get("id") ?? "";
  const title = col ? PRINTABLE[col] : undefined;
  const r = col && title ? s.byId[col].get(id) : undefined;
  const printed = useRef(false);

  useEffect(() => {
    if (r && params.get("auto") && !printed.current) {
      printed.current = true;
      setTimeout(() => window.print(), 400);
    }
  }, [r, params]);

  if (s.loading) return <p className="text-sm text-muted">Loading…</p>;
  if (!col || !title || !r) return <p className="text-sm text-muted">This document could not be found.</p>;

  return (
    <div>
      <div className="print-toolbar" data-noprint>
        <Link className="btn" href={`${MODULES[col].href}?id=${r.id}`}>Back to {MODULES[col].singular.toLowerCase()}</Link>
        <span className="text-sm text-muted">Use “Print / Save as PDF”, then choose “Save as PDF” as the printer to make a PDF.</span>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          <Printer size={14} /> Print / Save as PDF
        </button>
      </div>
      <TradeDocument col={col} r={r} s={s} title={title} />
    </div>
  );
}

