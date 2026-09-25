"use client";

import Link from "next/link";
import { fmtCompact, num, rateOf } from "@/lib/calc";
import { piInfo, soInfo, type Store } from "@/lib/derive";
import { MODULES } from "@/lib/modules";
import { stageKind } from "@/lib/stages";
import { dealRoute } from "@/lib/workflow";
import type { CollectionName, Rec } from "@/lib/types";

/**
 * The signature element: a deal drawn as a shipping route. Each document type is a port of
 * call; brass track means the deal has reached that stop, a dashed track means it hasn't yet.
 */
export function DealRoute({ col, r, s, onOpen }: { col: CollectionName; r: Rec; s: Store; onOpen: (c: CollectionName, id: string) => void }) {
  const stops = dealRoute(col, r, s);
  if (!stops) return null;
  const lastReached = stops.reduce((i, st, idx) => (st.recs.length ? idx : i), -1);
  return (
    <ol className="-mx-1 flex overflow-x-auto px-1 pb-1" aria-label="Deal route">
      {stops.map((st, i) => {
        const reached = st.recs.length > 0;
        const here = st.col === col;
        const first = st.recs[0];
        return (
          <li key={st.col} className="relative min-w-[112px] flex-1">
            {/* track to the next stop */}
            {i < stops.length - 1 && (
              <span
                aria-hidden
                className={`absolute top-[9px] left-[22px] right-0 h-0 border-t-2 ${i < lastReached ? "border-brass" : "border-dashed border-line-strong"}`}
              />
            )}
            <span
              aria-hidden
              className={`relative z-10 grid size-5 place-items-center rounded-full border-2 ${
                here ? "border-accent bg-accent" : reached ? "border-brass bg-brass" : "border-line-strong bg-surface"
              }`}
            >
              {(here || reached) && <span className={`size-1.5 rounded-full ${here ? "bg-accent-ink" : "bg-surface"}`} />}
            </span>
            <div className={`eyebrow mt-2 ${here ? "!text-accent" : ""}`}>{st.label}</div>
            {first ? (
              <button
                type="button"
                disabled={here && st.recs.length === 1 && first.id === r.id}
                onClick={() => onOpen(st.col, first.id)}
                className="serial mt-0.5 text-left text-ink hover:text-accent hover:underline disabled:no-underline disabled:hover:text-ink"
              >
                {first.serial ?? "—"}
                {st.recs.length > 1 && <span className="ml-1 text-faint">+{st.recs.length - 1}</span>}
              </button>
            ) : (
              <div className="mt-0.5 text-xs text-faint">Not yet</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

type Stop = { col: CollectionName; label: string; count: number; figure: string; note: string };

/** Dashboard version: the whole business as one route, with what is currently moving at each stop. */
export function PipelineRoute({ s }: { s: Store }) {
  const open = (c: CollectionName) => s[c].filter((r) => stageKind(c, r.status) === "open");
  const pkr = (rows: Rec[]) => rows.reduce((t, r) => t + num(r.amountPKR), 0);
  const liveSo = s.salesOrders.filter((o) => o.status !== "Cancelled");
  const undelivered = liveSo.filter((o) => !soInfo(o, s).delivered && o.status !== "Delivered" && o.status !== "Closed");
  const pendingPi = s.proformaInvoices.filter((p) => p.type !== "From Supplier" && p.status !== "Cancelled" && piInfo(p, s).pending > 0);
  const inTransit = s.deliveries.filter((d) => stageKind("deliveries", d.status) === "open");

  const stops: Stop[] = [
    { col: "rfqs", label: "RFQs", count: open("rfqs").length, figure: String(open("rfqs").length), note: `of ${s.rfqs.length} open` },
    { col: "quotations", label: "Quotations", count: open("quotations").length, figure: fmtCompact(pkr(open("quotations"))), note: `${open("quotations").length} awaiting reply` },
    { col: "salesOrders", label: "Sales orders", count: undelivered.length, figure: fmtCompact(pkr(undelivered)), note: `${undelivered.length} to deliver` },
    { col: "purchaseOrders", label: "Purchase orders", count: open("purchaseOrders").length, figure: fmtCompact(pkr(open("purchaseOrders"))), note: `${open("purchaseOrders").length} with suppliers` },
    {
      col: "proformaInvoices",
      label: "Proformas",
      count: pendingPi.length,
      figure: fmtCompact(pendingPi.reduce((t, p) => t + piInfo(p, s).pending * rateOf(p), 0)),
      note: `${pendingPi.length} awaiting payment`,
    },
    { col: "deliveries", label: "Deliveries", count: inTransit.length, figure: String(inTransit.length), note: "on the way" },
  ];

  return (
    <ol className="grid grid-cols-2 gap-y-6 sm:grid-cols-3 xl:grid-cols-6">
      {stops.map((st, i) => (
        <li key={st.col} className="relative pr-4">
          {i < stops.length - 1 && <span aria-hidden className="absolute top-[9px] left-[22px] right-0 hidden border-t-2 border-brass/70 xl:block" />}
          <span aria-hidden className="relative z-10 grid size-5 place-items-center rounded-full border-2 border-brass bg-surface">
            <span className="size-1.5 rounded-full bg-brass" />
          </span>
          <Link href={MODULES[st.col].href} className="group mt-3 block">
            <div className="eyebrow group-hover:!text-accent">{st.label}</div>
            <div className="display num mt-1 text-[30px] leading-none text-ink">
              {st.col === "rfqs" || st.col === "deliveries" ? st.figure : <><span className="mr-1 align-top font-sans text-[11px] font-medium tracking-wide text-faint">PKR</span>{st.figure}</>}
            </div>
            <div className="mt-1.5 text-xs text-muted">{st.note}</div>
          </Link>
        </li>
      ))}
    </ol>
  );
}
