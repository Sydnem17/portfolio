"use client";

import { useState } from "react";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (r.ok) {
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } else {
      setError((await r.json().catch(() => ({}))).error ?? "Sign-in failed");
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-white px-4">
      <form onSubmit={submit} className="w-full max-w-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" width={44} height={44} />
        <h1 className="mt-6 text-[26px] font-semibold tracking-tight">Sign in to CloudSweep</h1>
        <p className="mt-1.5 text-[15px] text-ink-muted">Your private control room for every cloud drive you own.</p>
        <label className="mt-8 block text-[13px] font-medium" htmlFor="pw">
          Password
        </label>
        <input
          id="pw"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-line px-4 py-3 text-[15px] outline-none focus:border-ink"
        />
        {error && <p className="mt-3 text-[13px] text-bad">{error}</p>}
        <button disabled={busy || !password} className="mt-5 w-full rounded-xl bg-ink py-3 text-[15px] font-medium text-white disabled:opacity-40">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
