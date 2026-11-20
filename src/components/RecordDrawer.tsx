"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, ListTodo, Printer, Trash2 } from "lucide-react";
import { useStore } from "./DataProvider";
import { Attachments, CurrencyField, ItemsEditor, ListSelect, MultiSelect, RefSelect } from "./fields";
import { Badge, Drawer, Section } from "./ui";
import { deleteRecord, newId, patchRecord, saveRecord, saveSettings } from "@/lib/db";
import { contactDate, contactDetails, latestMarketingContact, marketingChannelName, marketingStatus } from "@/lib/marketing";
import { fmtDate, fmtMoney, fmtPct, num, today } from "@/lib/calc";
import { clientInfo, deliveryInfo, piInfo, poInfo, soInfo, supplierInfo, type Store } from "@/lib/derive";
import { MODULES, labelOf, statusTone, type FieldDef } from "@/lib/modules";
import { conversionsFor, linkedRecords } from "@/lib/workflow";
import { DealRoute } from "./TradeRoute";
import { TotalPriceConverter } from "./TotalPriceConverter";
import { QuotationCostSheet } from "./QuotationCostSheet";
import { CalculationSheet } from "./CalculationSheet";
import { PRINTABLE } from "./TradeDocument";
import { stageKind } from "@/lib/stages";
import { FEATURES } from "@/lib/features";
import type { CollectionName, LineItem, Rec } from "@/lib/types";

type DrawerTab = "overview" | "details" | "items" | "costSheet" | "margin" | "files";

export function RecordDrawer({ col, id, onClose, onOpen, initialValues }: { initialValues?: Partial<Rec>; col: CollectionName; id: string | "new"; onClose: () => void; onOpen: (col: CollectionName, id: string) => void }) {
  const s = useStore();
  const m = MODULES[col];
  const existing = id === "new" ? undefined : s.byId[col].get(id);
  const [data, setData] = useState<Rec>(() => {
    if (existing && col === 'deliveries') {
      const info = deliveryInfo(existing, s);
      return { ...existing, items: info.items, currency: info.currency, exchangeRate: info.exchangeRate, costingVersion: 1 };
    }
    if (existing && col === "marketing") return { ...existing, status: marketingStatus(existing), lastContactDate: contactDate(existing), lastContactDetails: contactDetails(existing) };
    return existing ?? ({ id: newId(col), attachments: [], ...m.defaults(s), ...initialValues } as Rec);
  });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isNew = !existing;
  const itemsModeForTabs = m.itemsMode?.(data);
  // One job per tab, so a record never opens as one long page.
  const tabs: { key: DrawerTab; label: string; badge?: string }[] = [
    ...(existing ? [{ key: "overview" as const, label: "Overview" }] : []),
    { key: "details", label: "Details" },
    ...(itemsModeForTabs ? [{ key: "items" as const, label: `Items${data.items?.length ? ` (${data.items.length})` : ""}` }] : []),
    ...(col === "quotations" || col === "salesOrders" || col === "purchaseOrders" ? [{ key: "costSheet" as const, label: "Cost sheet" }] : []),
    ...(col === "quotations" || col === "salesOrders" || col === "costSheets" ? [{ key: "margin" as const, label: "Margin analysis", badge: data.netMarginPct !== undefined ? fmtPct(data.netMarginPct) : undefined }] : []),
    { key: "files", label: `Files${data.attachments?.length ? ` (${data.attachments.length})` : ""}` },
  ];
  const [tab, setTab] = useState<DrawerTab>(existing ? "overview" : "details");
  const fields = m.fields.map(f => col === "marketing" && !isNew && !existing?.clientId && f.name === "clientId" ? { ...f, required: false } : f);
  const close = () => { if (!busy && (!dirty || window.confirm("Discard unsaved changes?"))) onClose(); };

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
  const setField = (f: FieldDef, value: unknown) => set({ [f.name]: value, ...(f.autofill && typeof value === 'string' && value ? f.autofill(value, data, s) : {}) });
  const itemsMode = m.itemsMode?.(data);
  const computed = m.compute?.(data);
  const previewAmount = m.amountField
    ? num(computed?.[m.amountField] ?? data[m.amountField])
    : num(data.amount ?? (num(data.qty ?? 1) * num(data.unitCost)));

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    const missing = fields.filter((f) => f.required && (!f.showIf || f.showIf(data)) && (data[f.name] === undefined || data[f.name] === ""));
    if (missing.length) { setTab("details"); return setError(`Required: ${missing.map((f) => f.label).join(", ")}`); }
    if (col === "marketing" && ["Contacted", "Follow-up", "Closed"].includes(data.status) && (!data.lastContactDate || !String(data.lastContactDetails || '').trim())) return setError("Add the last contact date and details for this activity status.");
    if (col === "marketing" && data.lastContactDate && data.lastContactDate > today()) return setError("Last contact date cannot be in the future.");
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
    if (busy) return;
    const links = linkedRecords(col, data, s).length;
    const msg = links
      ? `Delete ${labelOf(col, data, s)}? ${links} linked record(s) will keep pointing at it and show it as deleted.`
      : `Delete ${labelOf(col, data, s)}? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError('');
    try { await deleteRecord(col, data.id); onClose(); }
    catch (err) { setError(`Delete failed: ${(err as Error).message}`); }
    finally { setBusy(false); }
  }

  const title = isNew ? `New ${m.singular.toLowerCase()}` : labelOf(col, existing, s);

  return (
    <Drawer
      open
      onClose={close}
      eyebrow={isNew ? "New record" : m.singular}
      title={title}
      aside={existing ? <DealRoute col={col} r={existing} s={s} onOpen={onOpen} /> : undefined}
      footer={
        <>
          {error && <span className="mr-auto self-center text-sm text-bad">{error}</span>}
          {!isNew && (
            <button type="button" className="btn btn-danger mr-auto" onClick={remove} disabled={busy}>
              <Trash2 size={14} /> Delete
            </button>
          )}
          {!isNew && PRINTABLE[col] && (
            <a className="btn" href={`/print/?col=${col}&id=${encodeURIComponent(existing.id)}`} target="_blank" rel="noreferrer" title={`Print or save the ${PRINTABLE[col]} as PDF`}>
              <Printer size={14} /> {PRINTABLE[col]} PDF
            </a>
          )}
          <button type="button" className="btn" onClick={close} disabled={busy}>
            Close
          </button>
          <button type="submit" form="record-form" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : isNew ? "Create" : dirty ? "Save changes" : "Saved"}
          </button>
        </>
      }
    >
      {tabs.length > 1 && (
        <div role="tablist" aria-label={`${m.singular} sections`} className="erp-tabs drawer-tabs mb-4">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}{t.badge ? <span className="drawer-tab-badge">{t.badge}</span> : null}
            </button>
          ))}
        </div>
      )}

      <form id="record-form" onSubmit={save}>
        {tab === "overview" && existing && (
          <>
            <Summary col={col} r={existing} s={s} />
            {col === "clients" && <div className="mb-4"><Link className="btn" href={`/marketing/?new=1&client=${encodeURIComponent(existing.id)}`}>Record marketing activity</Link></div>}
            <Workflow col={col} r={existing} s={s} dirty={dirty} onOpen={onOpen} />
            {col !== "schedule" && <RecordTasks col={col} r={existing} s={s} />}
            <Linked col={col} r={existing} s={s} onOpen={onOpen} />
            <p className="text-xs text-faint">Created {fmtDate(existing.createdAt)} · Updated {fmtDate(existing.updatedAt)}</p>
          </>
        )}

        {tab === "details" && (
          <>
            {col === "marketing" && data.clientId && <Section title="Selected client">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p><strong>{s.byId.clients.get(data.clientId)?.name || "Client no longer available"}</strong><br />{s.byId.clients.get(data.clientId)?.contactPerson || ""}</p>
                <p>{s.byId.clients.get(data.clientId)?.email || "No email recorded"}<br />{s.byId.clients.get(data.clientId)?.whatsapp || s.byId.clients.get(data.clientId)?.mobile || s.byId.clients.get(data.clientId)?.phone || "No phone recorded"}</p>
              </div>
              {(() => { const last = latestMarketingContact(data, s.marketing); return last ? <p className="mt-3 text-xs text-muted">Latest contact: {fmtDate(contactDate(last))} · {marketingChannelName(last.channel)} · {contactDetails(last) || "No details recorded"}</p> : <p className="mt-3 text-xs text-muted">No previous contact recorded for this client.</p>; })()}
            </Section>}
            {fieldSections(fields.filter((f) => f.type !== "items" && (!f.showIf || f.showIf(data)))).map((sec) => (
            <Section key={sec.title} title={sec.title}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sec.fields
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
            ))}
            {!itemsMode && (col === "payments" || col === "expenses" || col === "financeEntries" || col === "investors" || col === "companyDocs" || data.amount != null || (m.amountField && data[m.amountField] != null)) && (
              <Section title="Total Price & Currency Converter">
                <TotalPriceConverter
                  amount={previewAmount}
                  currency={data.currency || "PKR"}
                  exchangeRate={typeof data.exchangeRate === "number" ? data.exchangeRate : Number(data.exchangeRate) || 1}
                  onRateChange={(rate) => set({ exchangeRate: rate })}
                  mode="amount"
                  label={col === "payments" ? "Payment amount" : col === "expenses" ? "Expense amount" : col === "investors" ? "Investment principal" : "Total amount"}
                />
              </Section>
            )}
          </>
        )}

        {tab === "items" && itemsMode && (
          <Section title={m.fields.find((f) => f.type === "items")?.label ?? "Items"}>
            <ItemsEditor
              mode={itemsMode}
              items={data.items}
              currency={data.currency || "PKR"}
              purchaseCurrency={data.purchaseCurrency}
              purchaseExchangeRate={data.purchaseExchangeRate}
              exchangeRate={typeof data.exchangeRate === "number" ? data.exchangeRate : Number(data.exchangeRate) || 1}
              onRateChange={(rate) => set({ exchangeRate: rate })}
              onChange={(items) => set({ items })}
            />
          </Section>
        )}

        {tab === "costSheet" && <CalculationSheet data={data} set={set} col={col} />}

        {tab === "margin" && <QuotationCostSheet data={data} set={set} col={col} />}

        {tab === "files" && (
          <Section title="Attachments">
            <Attachments col={col} recordId={data.id} value={data.attachments} onChange={(attachments) => set({ attachments })} />
          </Section>
        )}
      </form>
    </Drawer>
  );
}

/** Tasks raised from a record: who must do what by when, listed here and in the planner. */
export function tasksFor(col: CollectionName, r: Rec, s: Store) {
  const own = (t: Rec) => t.linkCol === col && t.linkId === r.id;
  const legacy = (t: Rec) =>
    !t.linkCol && ((col === "clients" && t.clientId === r.id) || (col === "suppliers" && t.supplierId === r.id) || (col === "salesOrders" && t.salesOrderId === r.id) || (col === "purchaseOrders" && t.purchaseOrderId === r.id));
  return s.schedule.filter((t) => own(t) || legacy(t)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function RecordTasks({ col, r, s }: { col: CollectionName; r: Rec; s: Store }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(today());
  const [priority, setPriority] = useState("Medium");
  const [who, setWho] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const tasks = tasksFor(col, r, s);
  const label = labelOf(col, r, s);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!title.trim()) return setErr("Write what needs doing.");
    setBusy(true);
    setErr("");
    try {
      const so = col === "salesOrders" ? r : r.salesOrderId ? s.byId.salesOrders.get(r.salesOrderId) : undefined;
      const links = {
        clientId: col === "clients" ? r.id : r.clientId || so?.clientId || "",
        supplierId: col === "suppliers" ? r.id : r.supplierId || "",
        salesOrderId: so?.id ?? "",
        purchaseOrderId: col === "purchaseOrders" ? r.id : r.purchaseOrderId || "",
      };
      await saveRecord("schedule", { id: newId("schedule"), ...MODULES.schedule.defaults(s), title: title.trim(), date: due, priority, assignedTo: who.trim(), status: "Pending", category: s.settings.taskCategories.includes("General Note") ? "General Note" : s.settings.taskCategories[0] ?? "", ...links, linkCol: col, linkId: r.id, linkLabel: `${MODULES[col].singular}: ${label}` }, { serialPrefix: MODULES.schedule.prefix });
      setTitle("");
      setWho("");
    } catch (x) {
      setErr(`Could not add the task: ${(x as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (t: Rec) => patchRecord("schedule", t.id, { status: t.status === "Completed" ? "Pending" : "Completed" }).catch((x) => setErr((x as Error).message));

  return (
    <Section title={`Tasks${tasks.length ? ` (${tasks.filter((t) => stageKind("schedule", t.status) === "open").length} open)` : ""}`}>
      {tasks.length > 0 && (
        <ul className="erp-record-tasks">
          {tasks.map((t) => {
            const done = t.status === "Completed";
            const late = !done && stageKind("schedule", t.status) === "open" && t.date && t.date < today();
            return (
              <li key={t.id} className={done ? "done" : ""}>
                <button type="button" onClick={() => toggle(t)} aria-label={done ? `Reopen ${t.title}` : `Mark ${t.title} done`} title={done ? "Reopen" : "Mark done"}>
                  {done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                </button>
                <Link href={`/schedule/?id=${t.id}`} className="min-w-0 flex-1 truncate">{t.title}</Link>
                {t.assignedTo && <span className="text-xs text-muted">{t.assignedTo}</span>}
                <Badge tone={late ? "bad" : done ? "good" : t.priority === "Urgent" || t.priority === "High" ? "warn" : "muted"}>{done ? "Done" : `${late ? "Late · " : ""}${fmtDate(t.date)}`}</Badge>
              </li>
            );
          })}
        </ul>
      )}
      <div className="erp-task-form" role="group" aria-label="Create a task for this record" onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") void add(e); }}>
        <ListTodo size={15} className="text-muted" />
        <input className="field flex-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Create task, e.g. Follow up ${MODULES[col].singular.toLowerCase()}…`} aria-label="Task" />
        <input className="field w-36" type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
        <select className="field w-28" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
          {s.settings.taskPriorities.map((p) => <option key={p}>{p}</option>)}
        </select>
        <input className="field w-32" value={who} onChange={(e) => setWho(e.target.value)} placeholder="Assigned to" aria-label="Assigned to" />
        <button type="button" className="btn btn-primary" disabled={busy} onClick={add}>{busy ? "Adding…" : "Create task"}</button>
      </div>
      {err && <p className="mt-1 text-xs text-bad">{err}</p>}
      {FEATURES.messaging && <p className="mt-2 text-xs"><Link className="text-accent hover:underline" href={`/messages/?compose=1&col=${col}&id=${encodeURIComponent(r.id)}`}>Send a message to a colleague about this {MODULES[col].singular.toLowerCase()} →</Link></p>}
    </Section>
  );
}

/** Details split into titled sections: a field with `section` starts a new one. */
function fieldSections(fields: FieldDef[]) {
  const out: { title: string; fields: FieldDef[] }[] = [];
  for (const f of fields) {
    if (!out.length || f.section) out.push({ title: f.section ?? "Details", fields: [] });
    out[out.length - 1].fields.push(f);
  }
  return out;
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
                {rec.date && <span>{fmtDate(rec.date)}</span>}
                {"amount" in rec && <span>{fmtMoney(rec.amount, rec.currency)}</span>}
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
        ["Total cost", fmtMoney(r.totalCost, r.purchaseCurrency || r.currency)],
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
