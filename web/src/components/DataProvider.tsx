"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { collection, doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { fb, isConfigured } from "@/lib/firebase";
import { mergeSettings } from "@/lib/settings";
import { COLLECTIONS, type CollectionName, type Rec, type Settings } from "@/lib/types";
import type { Store } from "@/lib/derive";
import { LoginScreen, SetupScreen } from "./LoginScreen";

type Ctx = Store & { user: User; loading: boolean };
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

  useEffect(() => {
    if (!isConfigured) return;
    return onAuthStateChanged(fb().auth, setUser);
  }, []);

  // Single-user system: the first account to sign in becomes the owner (enforced by the
  // security rules); any other account is refused.
  useEffect(() => {
    if (!user) return;
    const ref = doc(fb().db, "meta", "owner");
    let cancelled = false;
    (async () => {
      const snap = await getDoc(ref);
      if (!snap.exists()) await setDoc(ref, { uid: user.uid, email: user.email, claimedAt: new Date().toISOString() });
      else if (snap.data().uid !== user.uid) return !cancelled && setOwner("denied");
      if (!cancelled) setOwner("ok");
      // Offline with no cached owner doc: carry on — the security rules still guard the data.
    })().catch(() => !cancelled && setOwner("ok"));
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Single-user app with modest data: keep every collection live in memory so all
  // screens, derived stages and reports read the same up-to-date records.
  useEffect(() => {
    if (!user || owner !== "ok") return;
    const { db } = fb();
    const unsubs = COLLECTIONS.map((col) =>
      onSnapshot(collection(db, col), (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Rec);
        setData((prev) => ({ ...prev, [col]: rows }));
        setLoaded((prev) => new Set(prev).add(col));
      }),
    );
    unsubs.push(
      onSnapshot(doc(db, "meta", "settings"), (snap) => {
        setSettings(mergeSettings(snap.data() as Partial<Settings> | undefined));
        setLoaded((prev) => new Set(prev).add("settings"));
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, [user, owner]);

  const value = useMemo<Ctx | null>(() => {
    if (!user) return null;
    const byId = Object.fromEntries(COLLECTIONS.map((c) => [c, new Map(data[c].map((r) => [r.id, r]))])) as Store["byId"];
    return { ...data, byId, settings, user, loading: loaded.size < COLLECTIONS.length + 1 };
  }, [data, settings, user, loaded]);

  if (!isConfigured) return <SetupScreen />;
  if (user === undefined) return <div className="grid min-h-screen place-items-center text-muted">Loading…</div>;
  if (!user || !value) return <LoginScreen />;
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
