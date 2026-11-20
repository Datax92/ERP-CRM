"use client";

import { useMemo, useState } from "react";
import { Copy, Download, Mail, MessageCircle, Users } from "lucide-react";
import { useStore } from "./DataProvider";
import { RecordLink } from "./RecordDrawer";
import { saveRecord, newId } from "@/lib/db";
import { fmtDate, fmtMonth, monthKey, today } from "@/lib/calc";
import { clientInfo } from "@/lib/derive";
import { contactDate, waNumber } from "@/lib/marketing";
import { MODULES } from "@/lib/modules";
import type { Rec } from "@/lib/types";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const emailsOf = (c: Rec) => [c.email, c.emailCc1, c.emailCc2].flatMap((e) => String(e || "").split(/[;,\s]+/)).map((e) => e.trim()).filter((e) => EMAIL.test(e));
const phoneOf = (c: Rec) => String(c.whatsapp || c.mobile || "").trim();
type GroupFilter = { region: string; country: string; sector: string; stage: string; activity: string; reach: string };
const blank: GroupFilter = { region: "", country: "", sector: "", stage: "", activity: "", reach: "" };

/** Pull a group of clients — e.g. Middle East cement customers — with their emails and WhatsApp,
    contact them, and record the activity for every client in the group on its date. */
export function MarketingGroups() {
  const s = useStore();
  const [f, setF] = useState<GroupFilter>(blank);
  const [msg, setMsg] = useState("");
  const [log, setLog] = useState({ date: today(), channel: "Email", subject: "", product: "", details: "", nextFollowUpDate: "" });
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");

  const last = useMemo(() => {
    const m = new Map<string, string>();
    s.marketing.forEach((a) => {
      const d = contactDate(a) || a.date;
      if (a.clientId && d && d > (m.get(a.clientId) ?? "")) m.set(a.clientId, d);
    });
    return m;
  }, [s.marketing]);

  const group = s.clients.filter((c) => {
    if (f.region && c.region !== f.region) return false;
    if (f.country && c.country !== f.country) return false;
    if (f.sector && c.sector !== f.sector) return false;
    const i = f.stage || f.activity ? clientInfo(c, s) : null;
    if (f.stage && i!.lifecycle !== f.stage) return false;
    if (f.activity && (i!.active ? "Active" : "Inactive") !== f.activity) return false;
    if (f.reach === "email" && !emailsOf(c).length) return false;
    if (f.reach === "whatsapp" && !phoneOf(c)) return false;
    return true;
  }).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const groupName = [f.region, f.country, f.sector, f.stage, f.activity].filter(Boolean).join(" · ") || "All clients";
  const emails = [...new Set(group.flatMap(emailsOf))];
  const phones = [...new Set(group.map(phoneOf).filter(Boolean))];
  const ids = new Set(group.map((c) => c.id));
  // When this group was last approached, month by month.
  const months = new Map<string, { n: number; clients: Set<string> }>();
  s.marketing.filter((a) => ids.has(a.clientId)).forEach((a) => {
    const k = monthKey(contactDate(a) || a.date);
    if (!k) return;
    const x = months.get(k) ?? { n: 0, clients: new Set<string>() };
    x.n++;
    x.clients.add(a.clientId);
    months.set(k, x);
  });
  const lastGroupDate = [...group.map((c) => last.get(c.id) ?? "")].sort().pop();

  const uniq = (xs: unknown[]) => [...new Set(xs.filter(Boolean).map(String))].sort();
  const pick = (k: keyof GroupFilter, label: string, opts: string[]) => (
    <label className="flex flex-col gap-1">
      <span className="eyebrow">{label}</span>
      <select className="field" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>
        <option value="">All</option>
        {opts.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  );

  async function copy(v: string, what: string) {
    try {
      await navigator.clipboard.writeText(v);
      setMsg(`${what} copied.`);
    } catch {
      setMsg("Could not use the clipboard — allow clipboard access and try again.");
    }
  }
  function csv() {
    const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["Client", "Contact person", "Email", "CC 1", "CC 2", "WhatsApp / mobile", "Region", "Country", "Sector", "Last marketing"].map(esc).join(","), ...group.map((c) => [c.name, c.contactPerson, c.email, c.emailCc1, c.emailCc2, phoneOf(c), c.region, c.country, c.sector, last.get(c.id) ?? ""].map(esc).join(","))];
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `client-group-${groupName.replace(/\W+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function record() {
    if (!group.length) return;
    if (!log.subject.trim() && !log.details.trim()) return setMsg("Write the subject or what was sent before recording.");
    if (log.date > today()) return setMsg("The activity date cannot be in the future.");
    if (!window.confirm(`Record a ${log.channel} activity dated ${fmtDate(log.date)} for all ${group.length} clients in “${groupName}”?`)) return;
    setBusy(true);
    setMsg("");
    try {
      const m = MODULES.marketing;
      for (const c of group) {
        await saveRecord("marketing", { id: newId("marketing"), ...m.defaults(s), clientId: c.id, date: log.date, channel: log.channel, status: log.nextFollowUpDate ? "Follow-up" : "Contacted", lastContactDate: log.date, lastContactDetails: log.details.trim() || log.subject.trim(), subject: log.subject.trim(), product: log.product, nextFollowUpDate: log.nextFollowUpDate, response: "No response", campaignGroup: groupName }, { serialPrefix: m.prefix });
      }
      setMsg(`Recorded for ${group.length} clients on ${fmtDate(log.date)}.`);
    } catch (e) {
      setMsg(`Stopped: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const mailto = `mailto:?bcc=${encodeURIComponent(emails.join(","))}&subject=${encodeURIComponent(log.subject)}&body=${encodeURIComponent(text)}`;

  return (
    <section className="card erp-mgroups mb-4">
      <div className="erp-mgroups-head">
        <h3><Users size={16} /> Client groups for marketing</h3>
        <p>Pick a group from the client list — for example Middle East · Cement — then email or WhatsApp it and record the activity with its date.</p>
      </div>
      <div className="erp-filter-panel">
        {pick("region", "Region", uniq([...s.settings.regions, ...s.clients.map((c) => c.region)]))}
        {pick("country", "Country", uniq(s.clients.map((c) => c.country)))}
        {pick("sector", "Sector", uniq([...s.settings.sectors, ...s.clients.map((c) => c.sector)]))}
        {pick("stage", "Client stage", ["Lead", "Inquiry received", "Offer given", "Order received", "Delivered"])}
        {pick("activity", "Activity", ["Active", "Inactive"])}
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Reachable by</span>
          <select className="field" value={f.reach} onChange={(e) => setF({ ...f, reach: e.target.value })}>
            <option value="">Any</option>
            <option value="email">Has email</option>
            <option value="whatsapp">Has WhatsApp / mobile</option>
          </select>
        </label>
      </div>

      <div className="erp-mgroups-sum">
        <b>{groupName}</b>
        <span>{group.length} clients · {emails.length} emails · {phones.length} WhatsApp / mobile</span>
        <span>{lastGroupDate ? `Last marketed ${fmtDate(lastGroupDate)}` : "Never marketed"}</span>
        <span className="spacer" />
        <button type="button" className="btn" disabled={!emails.length} onClick={() => copy(emails.join("; "), `${emails.length} email addresses`)}><Copy size={14} /> Copy emails</button>
        <a className={`btn ${emails.length ? "" : "pointer-events-none opacity-50"}`} href={mailto}><Mail size={14} /> Email group (BCC)</a>
        <button type="button" className="btn" disabled={!phones.length} onClick={() => copy(phones.join("\n"), `${phones.length} WhatsApp numbers`)}><MessageCircle size={14} /> Copy WhatsApp nos.</button>
        <button type="button" className="btn" disabled={!group.length} onClick={csv}><Download size={14} /> Download group</button>
      </div>
      {msg && <p role="status" className="px-1 pb-2 text-sm">{msg}</p>}

      <div className="erp-mgroups-grid">
        <div className="erp-mgroups-table">
          <table className="erp-report-table">
            <thead>
              <tr><th>Client</th><th>Email (+ CC)</th><th>WhatsApp</th><th>Region · sector</th><th>Last marketing</th></tr>
            </thead>
            <tbody>
              {group.slice(0, 200).map((c) => (
                <tr key={c.id}>
                  <td><RecordLink col="clients" id={c.id}>{c.name}</RecordLink>{c.contactPerson ? <div className="text-xs text-muted">{c.contactPerson}</div> : null}</td>
                  <td className="text-xs">{emailsOf(c).join(", ") || "—"}</td>
                  <td className="text-xs">{phoneOf(c) ? <a className="text-accent hover:underline" target="_blank" rel="noreferrer" href={`https://wa.me/${waNumber(phoneOf(c))}${text ? `?text=${encodeURIComponent(text)}` : ""}`}>{phoneOf(c)}</a> : "—"}</td>
                  <td className="text-xs">{[c.region, c.sector].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="text-xs">{last.get(c.id) ? fmtDate(last.get(c.id)) : "Never"}</td>
                </tr>
              ))}
              {group.length === 0 && <tr><td colSpan={5} className="text-sm text-muted">No client matches this group.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="space-y-3">
          <div className="erp-mgroups-box">
            <h4>Message</h4>
            <textarea className="field min-h-24" value={text} onChange={(e) => setText(e.target.value)} placeholder="Text for the group email / WhatsApp (optional)" aria-label="Message text" />
            <p className="text-xs text-muted">Click a WhatsApp number to open the chat with this text.</p>
          </div>
          <div className="erp-mgroups-box">
            <h4>Record the activity for this group</h4>
            <div className="grid grid-cols-2 gap-2">
              <input className="field" type="date" value={log.date} max={today()} onChange={(e) => setLog({ ...log, date: e.target.value })} aria-label="Activity date" />
              <select className="field" value={log.channel} onChange={(e) => setLog({ ...log, channel: e.target.value })} aria-label="Channel">
                {s.settings.marketingChannels.map((c) => <option key={c}>{c}</option>)}
              </select>
              <input className="field col-span-2" value={log.subject} onChange={(e) => setLog({ ...log, subject: e.target.value })} placeholder="Subject / campaign" aria-label="Subject" />
              <select className="field" value={log.product} onChange={(e) => setLog({ ...log, product: e.target.value })} aria-label="Product advertised">
                <option value="">Product (optional)</option>
                {s.settings.products.map((p) => <option key={p}>{p}</option>)}
              </select>
              <input className="field" type="date" value={log.nextFollowUpDate} onChange={(e) => setLog({ ...log, nextFollowUpDate: e.target.value })} aria-label="Next follow-up" title="Next follow-up (optional)" />
              <textarea className="field col-span-2 min-h-14" value={log.details} onChange={(e) => setLog({ ...log, details: e.target.value })} placeholder="What was sent or said" aria-label="Details" />
            </div>
            <button type="button" className="btn btn-primary mt-2" disabled={busy || !group.length} onClick={record}>{busy ? "Recording…" : `Record for ${group.length} clients`}</button>
          </div>
          <div className="erp-mgroups-box">
            <h4>This group’s marketing by month</h4>
            {months.size === 0 ? <p className="text-xs text-muted">No marketing recorded for this group yet.</p> : (
              <table className="erp-report-table">
                <thead><tr><th>Month</th><th className="r">Activities</th><th className="r">Clients reached</th></tr></thead>
                <tbody>
                  {[...months.entries()].sort(([a], [b]) => b.localeCompare(a)).slice(0, 12).map(([k, x]) => (
                    <tr key={k}><td>{fmtMonth(k)}</td><td className="r num">{x.n}</td><td className="r num">{x.clients.size}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
