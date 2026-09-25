"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Trash2 } from "lucide-react";
import { useStore } from "./DataProvider";
import { Attachments, CurrencyField, ItemsEditor, ListSelect, MultiSelect, RefSelect } from "./fields";
import { Badge, Drawer, Section } from "./ui";
import { deleteRecord, newId, saveRecord, saveSettings } from "@/lib/db";
import { fmtDate, fmtMoney, fmtPct, num } from "@/lib/calc";
import { clientInfo, deliveryInfo, piInfo, poInfo, soInfo, supplierInfo, type Store } from "@/lib/derive";
import { MODULES, labelOf, statusTone, type FieldDef } from "@/lib/modules";
import { conversionsFor, linkedRecords } from "@/lib/workflow";
import { DealRoute } from "./TradeRoute";
import type { CollectionName, LineItem, Rec } from "@/lib/types";

export function RecordDrawer({ col, id, onClose, onOpen }: { col: CollectionName; id: string | "new"; onClose: () => void; onOpen: (col: CollectionName, id: string) => void }) {
  const s = useStore();
  const m = MODULES[col];
  const existing = id === "new" ? undefined : s.byId[col].get(id);
  const [data, setData] = useState<Rec>(() => existing ?? ({ id: newId(col), attachments: [], ...m.defaults(s) } as Rec));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isNew = !existing;

  if (id !== "new" && !existing) {
    return (
      <Drawer open onClose={onClose} eyebrow={m.singular} title="Not found">
        <p className="text-sm text-muted">{s.loading ? "Loading…" : "This record no longer exists."}</p>
      </Drawer>
    );
  }

  const set = (patch: Partial<Rec>) => {
    setData((d) => ({ ...d, ...patch }));
    setDirty(true);
  };
  const setField = (f: FieldDef, value: unknown) => set({ [f.name]: value, ...(f.autofill && value ? f.autofill(value, data, s) : {}) });
  const itemsMode = m.itemsMode?.(data);

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    const missing = m.fields.filter((f) => f.required && (!f.showIf || f.showIf(data)) && (data[f.name] === undefined || data[f.name] === ""));
    if (missing.length) return setError(`Required: ${missing.map((f) => f.label).join(", ")}`);
    setBusy(true);
    setError("");
    try {
      const saved = await saveRecord(col, { ...data, ...(m.compute?.(data) ?? {}) }, { itemsMode, amountField: m.amountField, serialPrefix: m.prefix });
      await rememberListValues(saved.items, s);
      setDirty(false);
      if (isNew) onOpen(col, saved.id);
      else setData(saved);
    } catch (err) {
      setError(`Save failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const links = linkedRecords(col, data, s).length;
    const msg = links
      ? `Delete ${labelOf(col, data, s)}? ${links} linked record(s) will keep pointing at it and show it as deleted.`
      : `Delete ${labelOf(col, data, s)}? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    await deleteRecord(col, data.id);
    onClose();
  }

  const title = isNew ? `New ${m.singular.toLowerCase()}` : labelOf(col, existing, s);

  return (
    <Drawer
      open
      onClose={() => {
        if (!dirty || window.confirm("Discard unsaved changes?")) onClose();
      }}
      eyebrow={isNew ? "New record" : m.singular}
      title={title}
      aside={existing ? <DealRoute col={col} r={existing} s={s} onOpen={onOpen} /> : undefined}
      footer={
        <>
          {error && <span className="mr-auto self-center text-sm text-bad">{error}</span>}
          {!isNew && (
            <button type="button" className="btn btn-danger mr-auto" onClick={remove}>
              <Trash2 size={14} /> Delete
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
          <button type="submit" form="record-form" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : isNew ? "Create" : dirty ? "Save changes" : "Saved"}
          </button>
        </>
      }
    >
      {existing && <Summary col={col} r={existing} s={s} />}
      {existing && <Workflow col={col} r={existing} s={s} dirty={dirty} onOpen={onOpen} />}

      <form id="record-form" onSubmit={save}>
        <Section title="Details">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {m.fields
              .filter((f) => f.type !== "items" && (!f.showIf || f.showIf(data)))
              .map((f) => (
                <label key={f.name} className={`block space-y-1 text-sm ${f.wide || f.type === "textarea" || f.type === "multiselect" ? "sm:col-span-2 lg:col-span-3" : ""}`}>
                  <span className="text-muted">
                    {f.label}
                    {f.required && <span className="text-bad"> *</span>}
                  </span>
                  <FieldInput f={f} data={data} set={set} setField={setField} />
                  {f.help && <span className="block text-xs text-faint">{f.help}</span>}
                </label>
              ))}
          </div>
        </Section>

        {itemsMode && (
          <Section title={m.fields.find((f) => f.type === "items")?.label ?? "Items"}>
            <ItemsEditor mode={itemsMode} items={data.items} currency={data.currency || "PKR"} onChange={(items) => set({ items })} />
          </Section>
        )}

        <Section title="Attachments">
          <Attachments col={col} recordId={data.id} value={data.attachments} onChange={(attachments) => set({ attachments })} />
        </Section>
      </form>

      {existing && <Linked col={col} r={existing} s={s} onOpen={onOpen} />}
      {existing && (
        <p className="text-xs text-faint">
          Created {fmtDate(existing.createdAt)} · Updated {fmtDate(existing.updatedAt)}
        </p>
      )}
    </Drawer>
  );
}

/** New products/brands typed on a line item become filter options everywhere. */
async function rememberListValues(items: LineItem[] | undefined, s: Store) {
  if (!items?.length) return;
  const products = new Set(s.settings.products);
  const brands = new Set(s.settings.brands);
  const before = products.size + brands.size;
  items.forEach((i) => {
    if (i.product?.trim()) products.add(i.product.trim());
    if (i.brand?.trim()) brands.add(i.brand.trim());
  });
  if (products.size + brands.size !== before) await saveSettings({ ...s.settings, products: [...products], brands: [...brands] });
}

function FieldInput({ f, data, set, setField }: { f: FieldDef; data: Rec; set: (p: Partial<Rec>) => void; setField: (f: FieldDef, v: unknown) => void }) {
  const v = data[f.name];
  const on = (x: unknown) => setField(f, x);
  switch (f.type) {
    case "textarea":
      return <textarea className="field min-h-20" value={v ?? ""} onChange={(e) => on(e.target.value)} required={f.required} />;
    case "number":
      return <input className="field" type="number" step="any" value={v ?? ""} onChange={(e) => on(e.target.value === "" ? "" : Number(e.target.value))} required={f.required} />;
    case "date":
      return <input className="field" type="date" value={v ?? ""} onChange={(e) => on(e.target.value)} required={f.required} />;
    case "checkbox":
      return (
        <span className="flex h-[34px] items-center">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={!!v} onChange={(e) => on(e.target.checked)} />
        </span>
      );
    case "select":
      if (f.list) return <ListSelect list={f.list} value={v ?? ""} onChange={on} required={f.required} />;
      return (
        <select className="field" value={v ?? ""} onChange={(e) => on(e.target.value)} required={f.required}>
          {!f.required && <option value="">—</option>}
          {f.options!.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
    case "multiselect":
      return <MultiSelect list={f.list!} value={v ?? []} onChange={on} />;
    case "ref":
      return <RefSelect col={f.ref!} value={v ?? ""} onChange={on} required={f.required} />;
    case "currency":
      return <CurrencyField data={data} set={set} />;
    default:
      return <input className="field" type={f.type} value={v ?? ""} onChange={(e) => on(e.target.value)} required={f.required} />;
  }
}

function Workflow({ col, r, s, dirty, onOpen }: { col: CollectionName; r: Rec; s: Store; dirty: boolean; onOpen: (c: CollectionName, id: string) => void }) {
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const convs = conversionsFor(col, r, s);
  if (!convs.length) return null;
  return (
    <Section title="Next step">
      <div className="flex flex-wrap gap-2">
        {convs.map((c) => (
          <button
            key={c.label}
            type="button"
            className={`btn ${c === convs.find((x) => !x.disabled) && !dirty ? "btn-primary" : ""}`}
            title={dirty ? "Save your changes first" : c.disabled}
            disabled={dirty || !!c.disabled || !!busy}
            onClick={async () => {
              setBusy(c.label);
              setErr("");
              try {
                const created = await c.run();
                onOpen(c.target, created.id);
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setBusy("");
              }
            }}
          >
            {busy === c.label ? "Working…" : c.label} <ArrowRight size={14} />
          </button>
        ))}
      </div>
      {convs.some((c) => c.disabled) && <p className="mt-2 text-xs text-faint">{convs.filter((c) => c.disabled).map((c) => c.disabled).join(" · ")}</p>}
      {dirty && <p className="mt-2 text-xs text-warn">Save your changes before moving to the next step.</p>}
      {err && <p className="mt-2 text-xs text-bad">{err}</p>}
    </Section>
  );
}

function Linked({ col, r, s, onOpen }: { col: CollectionName; r: Rec; s: Store; onOpen: (c: CollectionName, id: string) => void }) {
  const links = linkedRecords(col, r, s);
  if (!links.length) return null;
  return (
    <Section title="Linked records">
      <ul className="divide-y divide-line text-sm">
        {links.map(({ col: c, rec }) => (
          <li key={c + rec.id}>
            <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 py-1.5 text-left hover:text-accent" onClick={() => onOpen(c, rec.id)}>
              <span>
                <span className="mr-2 text-xs text-faint">{MODULES[c].singular}</span>
                {labelOf(c, rec, s)}
              </span>
              <span className="flex items-center gap-2 text-xs text-muted">
                {rec.date && fmtDate(rec.date)}
                {"amount" in rec && fmtMoney(rec.amount, rec.currency)}
                {rec.status && <Badge tone={statusTone(rec.status)}>{rec.status}</Badge>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Kv({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3 lg:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="eyebrow">{k}</dt>
          <dd className="num mt-1 text-[15px] font-medium text-ink">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

const b = (v: string) => <Badge tone={statusTone(v)}>{v}</Badge>;
const lateText = (l: { days: number; overdue: boolean } | null) => (l && l.days ? <span className="text-bad">{`${l.days} days${l.overdue ? " overdue" : ""}`}</span> : "On time / —");

function Summary({ col, r, s }: { col: CollectionName; r: Rec; s: Store }) {
  let items: [string, ReactNode][] = [];
  switch (col) {
    case "clients": {
      const i = clientInfo(r, s);
      items = [
        ["Stage", b(i.lifecycle)],
        ["RFQ stage", b(i.rfqStage)],
        ["Quotation stage", b(i.quotationStage)],
        ["PO stage", b(i.poStage)],
        ["Payment stage", b(i.paymentStage)],
        ["Orders value", fmtMoney(i.soTotalPKR)],
        ["Received", fmtMoney(i.receivedPKR)],
        ["Last activity", i.lastActivity ? `${fmtDate(i.lastActivity)} · ${i.inactiveDays} days ago` : "—"],
      ];
      break;
    }
    case "suppliers": {
      const i = supplierInfo(r, s);
      items = [
        ["Purchase orders", String(i.pos.length)],
        ["Purchased", fmtMoney(i.purchasedPKR)],
        ["Paid to vendor", fmtMoney(i.paidPKR)],
        ["Payable", fmtMoney(i.payablePKR)],
      ];
      break;
    }
    case "quotations":
      items = [
        ["Total price", fmtMoney(r.amount, r.currency)],
        ["Total cost", fmtMoney(r.totalCost, r.currency)],
        ["Margin", fmtMoney(r.margin, r.currency)],
        ["Margin %", fmtPct(r.marginPct)],
        ["Total in PKR", fmtMoney(r.amountPKR)],
      ];
      break;
    case "salesOrders": {
      const i = soInfo(r, s);
      items = [
        ["Order value", fmtMoney(r.amount, r.currency)],
        ["Total in PKR", fmtMoney(r.amountPKR)],
        ["Margin (quoted)", `${fmtMoney(r.margin, r.currency)} · ${fmtPct(r.marginPct)}`],
        ["Cost (PKR)", `${fmtMoney(i.costPKR)}${i.costIsActual ? " (from POs)" : " (estimated)"}`],
        ["PO issued to supplier", i.poIssued ? i.suppliers.join(", ") || "Yes" : "No"],
        ["Received", fmtMoney(i.received, r.currency)],
        ["Outstanding", fmtMoney(i.outstanding, r.currency)],
        ["Payment", b(i.payment)],
        ["Delivered", i.delivered ? fmtDate(i.deliveredDate) || "Yes" : "No"],
        ["Late delivery", lateText(i.late)],
      ];
      break;
    }
    case "purchaseOrders": {
      const i = poInfo(r, s);
      items = [
        ["PO value", fmtMoney(r.amount, r.currency)],
        ["Total in PKR", fmtMoney(r.amountPKR)],
        ["Paid to vendor", fmtMoney(i.paid, r.currency)],
        ["Outstanding", fmtMoney(i.outstanding, r.currency)],
        ["Vendor payment", b(i.payment)],
        ["Order confirmed", r.orderConfirmed ? `Yes${r.confirmationDate ? ` · ${fmtDate(r.confirmationDate)}` : ""}` : "No"],
        ["Late delivery", lateText(i.late)],
        ["Sales margin", i.so ? fmtMoney(num(i.so.amountPKR) - num(r.amountPKR)) : "—"],
      ];
      break;
    }
    case "proformaInvoices": {
      const i = piInfo(r, s);
      items = [
        ["Amount", fmtMoney(r.amount, r.currency)],
        ["Paid", fmtMoney(i.paid, r.currency)],
        ["Pending", fmtMoney(i.pending, r.currency)],
        ["Status", b(i.status)],
      ];
      break;
    }
    case "deliveries": {
      const i = deliveryInfo(r, s);
      items = [
        ["Delivery period", i.periodDays != null ? `${i.periodDays} days` : "—"],
        ["Late delivery", lateText(i.late)],
        ["Order value", i.so ? fmtMoney(i.so.amount, i.so.currency) : "—"],
        ["Payment", i.so ? b(soInfo(i.so, s).payment) : "—"],
      ];
      break;
    }
    default:
      return null;
  }
  return (
    <Section title="Overview">
      <Kv items={items} />
    </Section>
  );
}

export function RecordLink({ col, id, children }: { col: CollectionName; id: string; children: ReactNode }) {
  return (
    <Link href={`${MODULES[col].href}?id=${id}`} className="text-accent hover:underline">
      {children}
    </Link>
  );
}
