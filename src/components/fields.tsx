"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Paperclip, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useStore } from "./DataProvider";
import { saveSettings } from "@/lib/db";
import { fetchRateToPKR } from "@/lib/fx";
import { uploadAttachment } from "@/lib/storage";
import { emptyItem, fmtNum, fmtPct, itemTotals, num } from "@/lib/calc";
import { labelOf } from "@/lib/modules";
import { TotalPriceConverter } from "./TotalPriceConverter";
import type { Attachment, CollectionName, ItemsMode, LineItem, ListKey, Rec } from "@/lib/types";

const NEW = "__new__";

/** Select backed by an editable Settings list, with inline "add new". */
export function ListSelect({ list, value, onChange, required, id }: { list: ListKey; value: string; onChange: (v: string) => void; required?: boolean; id?: string }) {
  const { settings } = useStore();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const options = settings[list];

  async function add() {
    const v = draft.trim();
    if (!v) return;
    if (!options.includes(v)) await saveSettings({ ...settings, [list]: [...options, v] });
    onChange(v);
    setAdding(false);
    setDraft("");
  }

  if (adding)
    return (
      <div className="flex gap-1">
        <input
          autoFocus
          className="field"
          value={draft}
          placeholder="New value"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
            if (e.key === "Escape") setAdding(false);
          }}
        />
        <button type="button" className="btn px-2" onClick={add} aria-label="Add">
          <Plus size={14} />
        </button>
        <button type="button" className="btn px-2" onClick={() => setAdding(false)} aria-label="Cancel">
          <X size={14} />
        </button>
      </div>
    );

  return (
    <select id={id} className="field" value={value ?? ""} required={required} onChange={(e) => (e.target.value === NEW ? setAdding(true) : onChange(e.target.value))}>
      <option value="">—</option>
      {value && !options.includes(value) && <option value={value}>{value}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value={NEW}>＋ Add new…</option>
    </select>
  );
}

/** Searchable picker for a linked record (client, supplier, sales order…). */
export function RefSelect({ col, value, onChange, required, id }: { col: CollectionName; value: string; onChange: (v: string) => void; required?: boolean; id?: string }) {
  const s = useStore();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const current = value ? s.byId[col].get(value) : undefined;
  const options = useMemo(
    () =>
      s[col]
        .map((r) => ({ id: r.id, label: labelOf(col, r, s) }))
        .filter((o) => o.label.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => a.label.localeCompare(b.label))
        .slice(0, 50),
    [s, col, q],
  );

  return (
    <div className="relative">
      <input
        id={id}
        className="field"
        placeholder="Search…"
        value={open ? q : current ? labelOf(col, current, s) : value ? "(deleted record)" : ""}
        onFocus={() => {
          setQ("");
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setQ(e.target.value)}
        required={required && !value}
      />
      {value && !open && (
        <button type="button" className="absolute top-1/2 right-2 -translate-y-1/2 text-faint hover:text-ink" onClick={() => onChange("")} aria-label="Clear">
          <X size={14} />
        </button>
      )}
      {open && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-line bg-surface shadow-lg">
          {options.length === 0 && <div className="px-3 py-2 text-sm text-muted">No matches</div>}
          {options.map((o) => (
            <button
              type="button"
              key={o.id}
              className={`block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-surface-2 ${o.id === value ? "font-medium text-accent" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MultiSelect({ list, value, onChange }: { list: ListKey; value: string[]; onChange: (v: string[]) => void }) {
  const { settings } = useStore();
  const [draft, setDraft] = useState("");
  const selected = value ?? [];
  const options = settings[list].filter((o) => !selected.includes(o));

  async function add(v: string) {
    v = v.trim();
    if (!v || selected.includes(v)) return;
    if (!settings[list].includes(v)) await saveSettings({ ...settings, [list]: [...settings[list], v] });
    onChange([...selected, v]);
    setDraft("");
  }

  return (
    <div className="rounded-md border border-line bg-surface p-1.5">
      <div className="flex flex-wrap gap-1">
        {selected.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
            {v}
            <button type="button" onClick={() => onChange(selected.filter((x) => x !== v))} aria-label={`Remove ${v}`}>
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          list={`dl-${list}`}
          className="min-w-32 flex-1 bg-transparent px-1 text-sm outline-none"
          placeholder="Type or pick, then Enter"
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (settings[list].includes(v)) void add(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add(draft);
            }
          }}
        />
        <datalist id={`dl-${list}`}>
          {options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </div>
    </div>
  );
}

export function CurrencyField({ data, set }: { data: Rec; set: (patch: Partial<Rec>) => void }) {
  const [busy, setBusy] = useState(false);
  const [liveRate, setLiveRate] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const currency = data.currency || "PKR";

  useEffect(() => {
    if (currency && currency !== "PKR") {
      let cancelled = false;
      (async () => {
        try {
          const rate = await fetchRateToPKR(currency);
          if (!cancelled) {
            setLiveRate(rate);
            if (!data.exchangeRate || data.exchangeRate === 1) {
              set({ exchangeRate: rate });
            }
          }
        } catch {
          // Ignore
        }
      })();
      return () => {
        cancelled = true;
      };
    }
  }, [currency]);

  async function fetchRate(cur: string) {
    setBusy(true);
    setErr("");
    try {
      const rate = await fetchRateToPKR(cur, true);
      setLiveRate(rate);
      set({ exchangeRate: rate });
    } catch {
      setErr("Couldn't fetch rate — enter it manually.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex gap-1">
        <div className="w-28 shrink-0">
          <ListSelect
            list="currencies"
            value={currency}
            onChange={(v) => {
              set({ currency: v || "PKR", exchangeRate: v === "PKR" || !v ? 1 : data.exchangeRate });
              if (v && v !== "PKR") void fetchRate(v);
            }}
          />
        </div>
        {currency !== "PKR" && (
          <>
            <input
              className="field font-mono"
              type="number"
              step="any"
              min="0"
              aria-label="Exchange rate to PKR"
              value={data.exchangeRate ?? ""}
              onChange={(e) => set({ exchangeRate: e.target.value === "" ? "" : Number(e.target.value) })}
              required
            />
            <button type="button" className="btn shrink-0 px-2" title="Fetch today's real-time live rate" onClick={() => fetchRate(currency)} disabled={busy}>
              <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
            </button>
          </>
        )}
      </div>
      {currency !== "PKR" && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-faint">
            1 {currency} = {data.exchangeRate || "?"} PKR
          </span>
          {liveRate != null && Math.abs((Number(data.exchangeRate) || 0) - liveRate) > 0.05 && (
            <button
              type="button"
              onClick={() => set({ exchangeRate: liveRate })}
              className="font-medium text-accent hover:underline"
              title="Update to today's real-time market rate"
            >
              · Today&apos;s live: {liveRate} [Apply]
            </button>
          )}
        </div>
      )}
      {err && <p className="mt-1 text-xs text-bad">{err}</p>}
    </div>
  );
}

export function ItemsEditor({
  mode,
  items,
  onChange,
  currency,
  exchangeRate,
  onRateChange,
}: {
  mode: ItemsMode;
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  currency: string;
  exchangeRate?: number;
  onRateChange?: (rate: number) => void;
}) {
  const s = useStore();
  const rows = items ?? [];
  const cost = mode !== "basic";
  const sale = mode === "sale";
  const upd = (i: number, patch: Partial<LineItem>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const t = itemTotals(rows);
  const suppliers = [...s.suppliers].sort((a, b) => String(a.name).localeCompare(String(b.name)));

  return (
    <div>
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr>
              <th className="px-2 py-1.5 font-medium">#</th>
              <th className="px-2 py-1.5 font-medium">Description</th>
              <th className="px-2 py-1.5 font-medium">Product</th>
              <th className="px-2 py-1.5 font-medium">Brand</th>
              {sale && <th className="px-2 py-1.5 font-medium">Supplier</th>}
              <th className="w-24 px-2 py-1.5 font-medium">Qty</th>
              <th className="w-24 px-2 py-1.5 font-medium">Unit</th>
              {cost && <th className="w-36 px-2 py-1.5 font-medium">Unit cost</th>}
              {sale && <th className="w-36 px-2 py-1.5 font-medium">Offered rate</th>}
              {cost && <th className="px-2 py-1.5 text-right font-medium">Line total</th>}
              {sale && <th className="px-2 py-1.5 text-right font-medium">Margin %</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((it, i) => {
              const lineCost = num(it.qty) * num(it.unitCost);
              const linePrice = num(it.qty) * num(it.unitPrice);
              return (
                <tr key={i} className="border-t border-line align-top">
                  <td className="px-2 py-1.5 text-faint">{i + 1}</td>
                  <td className="px-1 py-1">
                    <textarea rows={1} className="field min-w-48" value={it.description} onChange={(e) => upd(i, { description: e.target.value })} />
                  </td>
                  <td className="px-1 py-1">
                    <input list="dl-items-products" className="field min-w-32" value={it.product} onChange={(e) => upd(i, { product: e.target.value })} />
                  </td>
                  <td className="px-1 py-1">
                    <input list="dl-items-brands" className="field min-w-24" value={it.brand} onChange={(e) => upd(i, { brand: e.target.value })} />
                  </td>
                  {sale && (
                    <td className="px-1 py-1">
                      <select className="field min-w-32" value={it.supplierId ?? ""} onChange={(e) => upd(i, { supplierId: e.target.value })}>
                        <option value="">—</option>
                        {suppliers.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  )}
                  <td className="px-1 py-1">
                    <input type="number" step="any" min="0" className="field" value={it.qty} onChange={(e) => upd(i, { qty: e.target.value === "" ? 0 : Number(e.target.value) })} />
                  </td>
                  <td className="px-1 py-1">
                    <input list="dl-items-units" className="field" value={it.unit} onChange={(e) => upd(i, { unit: e.target.value })} />
                  </td>
                  {cost && (
                    <td className="px-1 py-1">
                      <input type="number" step="any" min="0" className="field" value={it.unitCost} onChange={(e) => upd(i, { unitCost: e.target.value === "" ? 0 : Number(e.target.value) })} />
                    </td>
                  )}
                  {sale && (
                    <td className="px-1 py-1">
                      <input type="number" step="any" min="0" className="field" value={it.unitPrice} onChange={(e) => upd(i, { unitPrice: e.target.value === "" ? 0 : Number(e.target.value) })} />
                    </td>
                  )}
                  {cost && <td className="px-2 py-2 text-right whitespace-nowrap">{fmtNum(sale ? linePrice : lineCost, 2)}</td>}
                  {sale && <td className={`px-2 py-2 text-right ${linePrice && linePrice < lineCost ? "text-bad" : ""}`}>{linePrice ? fmtPct(((linePrice - lineCost) / linePrice) * 100) : "—"}</td>}
                  <td className="px-1 py-1">
                    <button type="button" className="btn btn-danger px-2" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove line">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-4 text-center text-sm text-muted">
                  No items yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <datalist id="dl-items-products">
        {s.settings.products.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      <datalist id="dl-items-brands">
        {s.settings.brands.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      <datalist id="dl-items-units">
        {s.settings.units.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="btn" onClick={() => onChange([...rows, emptyItem()])}>
          <Plus size={14} /> Add item
        </button>
        {cost && (
          <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <Stat label="Total cost" value={`${currency} ${fmtNum(t.totalCost, 2)}`} />
            {sale && <Stat label="Total price" value={`${currency} ${fmtNum(t.totalPrice, 2)}`} strong />}
            {sale && <Stat label="Margin" value={`${currency} ${fmtNum(t.margin, 2)}`} bad={t.margin < 0} />}
            {sale && <Stat label="Margin %" value={fmtPct(t.marginPct)} bad={t.margin < 0} />}
          </dl>
        )}
      </div>

      {cost && (
        <TotalPriceConverter
          amount={sale ? t.totalPrice : t.totalCost}
          currency={currency}
          exchangeRate={exchangeRate}
          onRateChange={onRateChange}
          totalCost={t.totalCost}
          margin={t.margin}
          marginPct={t.marginPct}
          mode={mode}
          label={sale ? "Total price" : "Total cost"}
        />
      )}
    </div>
  );
}

function Stat({ label, value, strong, bad }: { label: string; value: string; strong?: boolean; bad?: boolean }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className={`${strong ? "font-semibold" : ""} ${bad ? "text-bad" : ""}`}>{value}</dd>
    </div>
  );
}

export function Attachments({ col, recordId, value, onChange }: { col: CollectionName; recordId: string; value: Attachment[]; onChange: (v: Attachment[]) => void }) {
  const { settings } = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState("");
  const list = value ?? [];

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setErr("");
    const added: Attachment[] = [];
    setBusy(files.length);
    for (const f of Array.from(files)) {
      if (f.size > 32 * 1024 * 1024) {
        setErr(`${f.name} is over 32 MB.`);
        continue;
      }
      try {
        added.push(await uploadAttachment(col, recordId, f, settings.imgbbApiKey));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : `Upload failed for ${f.name}.`;
        setErr(msg);
      }
    }
    setBusy(0);
    if (added.length > 0) {
      onChange([...list, ...added]);
    }
    if (input.current) input.current.value = "";
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void upload(e.dataTransfer.files);
      }}
    >
      <ul className="space-y-1">
        {list.map((a, i) => {
          const isImg = a.thumbUrl || a.provider === "imgbb" || /\.(jpe?g|png|gif|webp|svg)$/i.test(a.name);
          return (
            <li key={a.path + i} className="flex items-center justify-between gap-2 rounded-md border border-line px-2 py-1.5 text-sm">
              <a href={a.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 text-accent hover:underline">
                {isImg ? (
                  <img
                    src={a.thumbUrl || a.url}
                    alt={a.name}
                    className="h-7 w-7 rounded object-cover border border-line shrink-0"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                ) : (
                  <Paperclip size={14} className="shrink-0 text-muted" />
                )}
                <span className="truncate">{a.name}</span>
              </a>
              <span className="flex shrink-0 items-center gap-2 text-xs text-faint">
                {(a.size / 1024).toFixed(0)} KB
                <button type="button" className="hover:text-bad" onClick={() => onChange(list.filter((_, j) => j !== i))} aria-label={`Remove ${a.name}`}>
                  <X size={14} />
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" className="btn" onClick={() => input.current?.click()} disabled={busy > 0}>
          <Paperclip size={14} /> {busy ? `Uploading ${busy}…` : "Attach files"}
        </button>
        <span className="text-xs text-faint">or drop files here</span>
        <input ref={input} type="file" multiple className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => upload(e.target.files)} />
      </div>
      {err && <p className="mt-1 text-xs text-bad">{err}</p>}
      {!settings.imgbbApiKey && !process.env.NEXT_PUBLIC_IMGBB_API_KEY && list.length === 0 && !err && (
        <p className="mt-1 text-xs text-muted">
          Attach photos, scans, or receipts (powered by ImgBB). Configure your key in{" "}
          <a href="/settings" className="text-accent underline">
            Settings
          </a>
          .
        </p>
      )}
    </div>
  );
}
