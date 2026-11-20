"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { collection, doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { fb, isConfigured } from "@/lib/firebase";
import { mergeSettings } from "@/lib/settings";
import { COLLECTIONS, OPTIONAL_COLLECTIONS, type CollectionName, type Rec, type Settings } from "@/lib/types";
import type { Store } from "@/lib/derive";
import { LoginScreen, SetupScreen } from "./LoginScreen";
import { FEATURES } from "@/lib/features";

/** Messages between members and who can be messaged. `ready` is false until the database allows it. */
export type Inbox = { messages: Rec[]; profiles: Rec[]; ready: boolean };
type Ctx = Store & { user: User; loading: boolean; inbox: Inbox };
const DataCtx = createContext<Ctx | null>(null);

export function useStore(): Ctx {
  const c = useContext(DataCtx);
  if (!c) throw new Error("useStore outside DataProvider");
  return c;
}

const emptyData = () => Object.fromEntries(COLLECTIONS.map((c) => [c, [] as Rec[]])) as Record<CollectionName, Rec[]>;

export function DataProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [data, setData] = useState(emptyData);
  const [settings, setSettings] = useState<Settings>(() => mergeSettings(undefined));
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const [owner, setOwner] = useState<"checking" | "ok" | "denied">("checking");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [inbox, setInbox] = useState<{ to: Rec[]; from: Rec[]; profiles: Rec[]; ready: boolean }>({ to: [], from: [], profiles: [], ready: false });

  useEffect(() => {
    if (!isConfigured) return;
    return onAuthStateChanged(fb().auth, (nextUser) => {
      setOwner('checking');
      setData(emptyData());
      setLoaded(new Set());
      setSettings(mergeSettings(undefined));
      setError('');
      setUser(nextUser);
    });
  }, []);

  // Membership is provisioned by an administrator; clients cannot grant access.
  useEffect(() => {
    if (!user) return;
    const ref = doc(fb().db, "members", user.uid);
    let cancelled = false;
    (async () => {
      const snap = await getDoc(ref);
      if (!snap.exists() || snap.data().enabled !== true) return !cancelled && setOwner("denied");
      if (!cancelled) setOwner("ok");
    })().catch(() => !cancelled && setError('Unable to verify account access. Check your connection and try again.'));
    return () => {
      cancelled = true;
    };
  }, [user, retry]);

  // Shared workspace with modest data: keep every collection live in memory so all
  // screens, derived stages and reports read the same up-to-date records.
  useEffect(() => {
    if (!user || owner !== "ok") return;
    const { db } = fb();
    const unsubs = COLLECTIONS.map((col) =>
      onSnapshot(collection(db, col), (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Rec);
        setData((prev) => ({ ...prev, [col]: rows }));
        setLoaded((prev) => new Set(prev).add(col));
      }, () => {
        // A module added after launch must not lock everyone out before its database rule is published.
        if (OPTIONAL_COLLECTIONS.includes(col)) setLoaded((prev) => new Set(prev).add(col));
        else setError(`Unable to load ${col}. Check your connection and account permissions, then retry.`);
      }),
    );
    unsubs.push(
      onSnapshot(doc(db, "meta", "settings"), (snap) => {
        setSettings(mergeSettings(snap.data() as Partial<Settings> | undefined));
        setLoaded((prev) => new Set(prev).add("settings"));
      }, () => setError('Unable to load company settings. Please retry.')),
    );
    return () => unsubs.forEach((u) => u());
  }, [user, owner, retry]);

  // Messages: each member reads only what was sent to or by them, and sees colleagues' names.
  useEffect(() => {
    if (!user || owner !== "ok" || !FEATURES.messaging) return;
    const { db } = fb();
    const rows = (snap: { docs: { id: string; data: () => object }[] }) => snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Rec);
    const off = () => setInbox((prev) => ({ ...prev, ready: false }));
    setDoc(doc(db, "profiles", user.uid), { uid: user.uid, email: user.email ?? "", name: user.displayName || (user.email ?? "").split("@")[0], lastSeen: serverTimestamp() }, { merge: true }).catch(() => undefined);
    const unsubs = [
      onSnapshot(collection(db, "profiles"), (snap) => setInbox((prev) => ({ ...prev, profiles: rows(snap), ready: true })), off),
      onSnapshot(query(collection(db, "messages"), where("toUid", "==", user.uid)), (snap) => setInbox((prev) => ({ ...prev, to: rows(snap) })), off),
      onSnapshot(query(collection(db, "messages"), where("fromUid", "==", user.uid)), (snap) => setInbox((prev) => ({ ...prev, from: rows(snap) })), off),
    ];
    return () => unsubs.forEach((u) => u());
  }, [user, owner, retry]);

  const value = useMemo<Ctx | null>(() => {
    if (!user) return null;
    const byId = Object.fromEntries(COLLECTIONS.map((c) => [c, new Map(data[c].map((r) => [r.id, r]))])) as Store["byId"];
    const messages = [...new Map([...inbox.to, ...inbox.from].map((m) => [m.id, m])).values()];
    return { ...data, byId, settings, user, loading: loaded.size < COLLECTIONS.length + 1, inbox: { messages, profiles: inbox.profiles, ready: inbox.ready } };
  }, [data, settings, user, loaded, inbox]);

  if (!isConfigured) return <SetupScreen />;
  if (user === undefined) return <div className="grid min-h-screen place-items-center text-muted">Loading…</div>;
  if (!user || !value) return <LoginScreen />;
  if (error) return <div className="grid min-h-screen place-items-center p-4"><div className="card max-w-lg space-y-4 p-6" role="alert"><h1 className="text-lg font-semibold">Could not load your workspace</h1><p>{error}</p><div className="flex gap-2"><button className="btn btn-primary" onClick={() => { setError(''); setRetry((n) => n + 1); }}>Retry</button><button className="btn" onClick={() => signOut(fb().auth)}>Sign out</button></div></div></div>;
  if (owner === "denied")
    return (
      <div className="grid min-h-screen place-items-center p-4 text-center text-sm">
        <div className="card space-y-3 p-6">
          <p>This account ({user.email}) does not have access to this system.</p>
          <button className="btn" onClick={() => signOut(fb().auth)}>
            Sign out
          </button>
        </div>
      </div>
    );
  if (owner === "checking") return <div className="grid min-h-screen place-items-center text-muted">Loading…</div>;
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
