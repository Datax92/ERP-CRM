"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Archive, Inbox, Reply, Send } from "lucide-react";
import { useStore } from "@/components/DataProvider";
import { Empty, PageHeader } from "@/components/ui";
import { fb } from "@/lib/firebase";
import { MODULES, labelOf } from "@/lib/modules";
import type { CollectionName, Rec } from "@/lib/types";
import { FEATURES } from "@/lib/features";

type Box = "inbox" | "sent" | "compose";

export default function MessagesPage() {
  if (!FEATURES.messaging) return <Empty>This page is not available.</Empty>;
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Messages />
    </Suspense>
  );
}

const when = (m: Rec) => String(m.sentAt || "");
const fmtWhen = (iso: string) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const who = (p?: Rec) => (p ? p.name || p.email : "Unknown");

function Messages() {
  const s = useStore();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const me = s.user.uid;
  const box: Box = params.get("compose") ? "compose" : params.get("box") === "sent" ? "sent" : "inbox";
  const openId = params.get("m") ?? "";
  const go = (next: Record<string, string>) => router.replace(`${pathname}?${new URLSearchParams(next)}`, { scroll: false });

  const all = s.inbox.messages;
  const inbox = all.filter((m) => m.toUid === me && !m.archivedByTo).sort((a, b) => when(b).localeCompare(when(a)));
  const sent = all.filter((m) => m.fromUid === me && !m.archivedByFrom).sort((a, b) => when(b).localeCompare(when(a)));
  const unread = inbox.filter((m) => !m.readAt).length;
  const list = box === "sent" ? sent : inbox;
  const open = all.find((m) => m.id === openId);

  async function read(m: Rec) {
    go({ ...(box === "sent" ? { box: "sent" } : {}), m: m.id });
    if (m.toUid === me && !m.readAt) await updateDoc(doc(fb().db, "messages", m.id), { readAt: new Date().toISOString() }).catch(() => undefined);
  }
  async function archive(m: Rec) {
    await updateDoc(doc(fb().db, "messages", m.id), m.toUid === me ? { archivedByTo: true } : { archivedByFrom: true }).catch(() => undefined);
    go(box === "sent" ? { box: "sent" } : {});
  }

  return (
    <div>
      <PageHeader
        title="Messages"
        subtitle="Send a message to a colleague, and see what was sent to you."
        actions={<button type="button" className="btn btn-primary" onClick={() => go({ compose: "1" })}><Send size={14} /> New message</button>}
      />
      {!s.inbox.ready && (
        <p className="card mb-4 p-4 text-sm text-warn" role="status">
          Messaging is waiting for the database rules to be published (firestore.rules → profiles & messages). Until then nothing can be sent or received.
        </p>
      )}
      <div className="erp-tabs mb-3" role="tablist" aria-label="Mailbox">
        <button role="tab" aria-selected={box === "inbox"} onClick={() => go({})}><Inbox size={13} /> Inbox{unread ? ` (${unread} new)` : ` (${inbox.length})`}</button>
        <button role="tab" aria-selected={box === "sent"} onClick={() => go({ box: "sent" })}><Send size={13} /> Sent / outbox ({sent.length})</button>
        <button role="tab" aria-selected={box === "compose"} onClick={() => go({ compose: "1" })}>Write</button>
      </div>

      {box === "compose" ? (
        <Compose onSent={() => go({ box: "sent" })} />
      ) : (
        <div className="erp-mail">
          <ul className="erp-mail-list card">
            {list.length === 0 && <li className="p-4 text-sm text-muted">{box === "sent" ? "Nothing sent yet." : "No messages yet."}</li>}
            {list.map((m) => (
              <li key={m.id}>
                <button type="button" className={`${m.id === openId ? "on" : ""} ${box === "inbox" && !m.readAt ? "unread" : ""}`} onClick={() => read(m)}>
                  <span className="erp-mail-from">{box === "sent" ? `To: ${m.toName || m.toEmail}` : m.fromName || m.fromEmail}</span>
                  <span className="erp-mail-when">{fmtWhen(when(m))}</span>
                  <span className="erp-mail-subj">{m.subject || "(no subject)"}</span>
                  <span className="erp-mail-snip">{String(m.body || "").slice(0, 90)}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="card erp-mail-read">
            {open ? (
              <>
                <h2>{open.subject || "(no subject)"}</h2>
                <p className="text-xs text-muted">
                  From <b>{open.fromName || open.fromEmail}</b> to <b>{open.toName || open.toEmail}</b> · {fmtWhen(when(open))}
                  {open.toUid !== me ? (open.readAt ? ` · read ${fmtWhen(open.readAt)}` : " · not read yet") : ""}
                </p>
                {open.linkCol && open.linkId && MODULES[open.linkCol as CollectionName] && (
                  <p className="mt-2 text-sm">About: <Link className="text-accent hover:underline" href={`${MODULES[open.linkCol as CollectionName].href}?id=${open.linkId}`}>{open.linkLabel || "the record"}</Link></p>
                )}
                <div className="erp-mail-body">{open.body}</div>
                <div className="flex gap-2">
                  {open.fromUid !== me && (
                    <button type="button" className="btn btn-primary" onClick={() => go({ compose: "1", to: open.fromUid, re: open.id })}><Reply size={14} /> Reply</button>
                  )}
                  <button type="button" className="btn" onClick={() => archive(open)}><Archive size={14} /> Archive</button>
                </div>
              </>
            ) : (
              <Empty>Select a message to read it.</Empty>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Compose({ onSent }: { onSent: () => void }) {
  const s = useStore();
  const params = useSearchParams();
  const me = s.user.uid;
  const re = s.inbox.messages.find((m) => m.id === params.get("re"));
  const linkCol = (params.get("col") || re?.linkCol || "") as CollectionName | "";
  const linkId = params.get("id") || re?.linkId || "";
  const linked = linkCol && MODULES[linkCol] ? s.byId[linkCol].get(linkId) : undefined;
  const linkLabel = linked && linkCol ? `${MODULES[linkCol].singular}: ${labelOf(linkCol, linked, s)}` : re?.linkLabel || "";
  const colleagues = s.inbox.profiles.filter((p) => p.uid !== me).sort((a, b) => who(a).localeCompare(who(b)));
  const [to, setTo] = useState(params.get("to") || "");
  const [subject, setSubject] = useState(re ? (String(re.subject).startsWith("Re:") ? re.subject : `Re: ${re.subject || ""}`) : linkLabel ? `About ${linkLabel}` : "");
  const [body, setBody] = useState(re ? `\n\n— On ${fmtWhen(when(re))}, ${re.fromName || re.fromEmail} wrote:\n${re.body}` : "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const target = s.inbox.profiles.find((p) => p.uid === to);
    if (!target) return setErr("Choose who the message is for.");
    if (!body.trim() && !subject.trim()) return setErr("Write a subject or a message.");
    setBusy(true);
    setErr("");
    try {
      const mine = s.inbox.profiles.find((p) => p.uid === me);
      await addDoc(collection(fb().db, "messages"), {
        fromUid: me,
        fromName: mine?.name || s.user.displayName || (s.user.email ?? "").split("@")[0],
        fromEmail: s.user.email ?? "",
        toUid: target.uid,
        toName: target.name || "",
        toEmail: target.email || "",
        subject: subject.trim(),
        body: body.trim(),
        sentAt: new Date().toISOString(),
        createdAt: serverTimestamp(),
        readAt: null,
        ...(linkCol && linkId ? { linkCol, linkId, linkLabel } : {}),
      });
      onSent();
    } catch (x) {
      setErr(`Not sent: ${(x as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card max-w-3xl space-y-3 p-5" onSubmit={send}>
      <label className="block space-y-1 text-sm">
        <span className="text-muted">To</span>
        <select className="field" value={to} onChange={(e) => setTo(e.target.value)} required>
          <option value="">Choose a colleague…</option>
          {colleagues.map((p) => <option key={p.uid} value={p.uid}>{who(p)}{p.name && p.email ? ` (${p.email})` : ""}</option>)}
        </select>
        {colleagues.length === 0 && <span className="block text-xs text-faint">Colleagues appear here once they have signed in to the ERP.</span>}
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Subject</span>
        <input className="field" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </label>
      {linkLabel && <p className="text-xs text-muted">Linked to {linkLabel}</p>}
      <label className="block space-y-1 text-sm">
        <span className="text-muted">Message</span>
        <textarea className="field min-h-48" value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      {err && <p className="text-sm text-bad">{err}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy || !s.inbox.ready}><Send size={14} /> {busy ? "Sending…" : "Send"}</button>
    </form>
  );
}
