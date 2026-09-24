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
    <div className="grid min-h-screen place-items-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <div>
          <h1 className="text-lg font-semibold">Sign in</h1>
          <p className="text-sm text-muted">Trade ERP</p>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="text-muted">Email</span>
          <input className="field" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-muted">Password</span>
          <input className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="text-sm text-bad">{error}</p>}
        {info && <p className="text-sm text-good">{info}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <button type="button" onClick={reset} className="w-full text-center text-xs text-muted hover:text-ink">
          Forgot password?
        </button>
      </form>
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
