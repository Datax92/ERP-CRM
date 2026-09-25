"use client";

import { useState } from "react";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { fb } from "@/lib/firebase";

export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signInWithEmailAndPassword(fb().auth, email.trim(), password);
    } catch {
      setError("Email or password is incorrect.");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!email) return setError("Enter your email first.");
    await sendPasswordResetEmail(fb().auth, email.trim()).catch(() => undefined);
    setInfo("If that account exists, a reset link has been sent.");
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* House panel */}
      <aside className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-ink lg:flex lg:flex-col lg:justify-between">
        <svg aria-hidden viewBox="0 0 600 800" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full opacity-25">
          <path d="M-20 700 C 120 520, 260 640, 330 460 S 520 240, 640 120" fill="none" stroke="var(--brass)" strokeWidth="1.5" strokeDasharray="2 8" strokeLinecap="round" />
          {[
            [110, 590],
            [330, 460],
            [470, 280],
          ].map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r="5" fill="var(--brass)" />
          ))}
        </svg>
        <div className="relative flex items-center gap-3">
          <div className="display grid size-11 place-items-center rounded-lg border border-brass/50 text-xl text-brass">T</div>
          <span className="eyebrow !text-sidebar-muted">Trade ledger</span>
        </div>
        <div className="relative max-w-md">
          <p className="display text-[44px] leading-[1.05] text-white">
            Every inquiry, order and payment — <em className="text-brass">one route.</em>
          </p>
          <p className="mt-5 text-sm leading-relaxed text-sidebar-muted">From the first RFQ to the last delivery receipt, each document carries the deal forward and every report reads from the same records.</p>
        </div>
        <div className="eyebrow relative !text-sidebar-muted/70">RFQ · Quotation · Sales order · Purchase order · Proforma · Delivery</div>
      </aside>

      {/* Sign-in */}
      <div className="grid place-items-center bg-bg p-6">
        <form onSubmit={submit} className="anim-rise w-full max-w-sm">
          <div className="eyebrow mb-3 lg:hidden">Trade ledger</div>
          <h1 className="display text-[36px] leading-tight text-ink">Sign in</h1>
          <p className="mt-1.5 mb-8 text-sm text-muted">Use the owner account for this system.</p>
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="eyebrow">Email</span>
              <input className="field" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="block space-y-1.5">
              <span className="eyebrow">Password</span>
              <input className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
          </div>
          {error && <p className="mt-4 text-sm text-bad">{error}</p>}
          {info && <p className="mt-4 text-sm text-good">{info}</p>}
          <button className="btn btn-primary mt-6 w-full !min-h-[42px]" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <button type="button" onClick={reset} className="mt-4 w-full text-center text-xs text-muted hover:text-ink">
            Forgot password?
          </button>
        </form>
      </div>
    </div>
  );
}

export function SetupScreen() {
  return (
    <div className="grid min-h-screen place-items-center p-4">
      <div className="card max-w-lg space-y-3 p-6 text-sm">
        <h1 className="text-lg font-semibold">Firebase is not configured</h1>
        <p className="text-muted">
          Copy <code>.env.example</code> to <code>.env.local</code>, fill in the Firebase web app keys, then restart the dev server. See <code>README.md</code>.
        </p>
      </div>
    </div>
  );
}
