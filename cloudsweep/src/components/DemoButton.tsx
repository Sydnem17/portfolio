"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass } from "./ui";
import { announceJobs } from "./JobDock";

export function DemoButton({ variant = "ghost" }: { variant?: "ghost" | "primary" | "brand" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={buttonClass(variant)}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/demo", { method: "POST" });
        announceJobs();
        router.refresh();
        setBusy(false);
      }}
    >
      {busy ? "Loading demo…" : "Try the demo library"}
    </button>
  );
}
