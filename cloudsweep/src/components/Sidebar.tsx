"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandMark } from "./BrandMark";

const NAV = [
  { href: "/", label: "Overview", icon: "M3 12h7V3H3v9Zm0 9h7v-6H3v6Zm11 0h7v-9h-7v9Zm0-18v6h7V3h-7Z" },
  { href: "/duplicates", label: "Duplicates", icon: "M8 8h11v11H8zM5 16H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1" },
  { href: "/library", label: "Library", icon: "M4 4h6v16H4zM14 4l6 1.5-3.5 14L13 18.5z" },
  { href: "/consolidate", label: "Consolidate", icon: "M4 7h10M4 12h7M4 17h10M17 8l4 4-4 4" },
  { href: "/photos", label: "Photos", icon: "M4 5h16v14H4zM4 15l4-4 5 5 3-3 4 4M15 9.5h.01" },
  { href: "/accounts", label: "Storage accounts", icon: "M7 18a4 4 0 0 1-.6-7.96A6 6 0 0 1 18 9.5a4.5 4.5 0 0 1-.5 8.5H7Z" },
  { href: "/bin", label: "Staging bin", icon: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" },
];

export function Sidebar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <button onClick={() => setOpen(!open)} className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium" aria-expanded={open}>
          Menu
        </button>
      </div>
      <aside
        className={`${open ? "block" : "hidden"} fixed inset-x-0 top-[57px] z-20 border-b border-line bg-white p-4 lg:sticky lg:top-0 lg:block lg:h-screen lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r lg:p-6`}
      >
        <div className="hidden lg:block">
          <Logo />
        </div>
        <nav className="mt-2 space-y-1 lg:mt-10">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition ${active ? "bg-ink text-white" : "text-ink-soft hover:bg-slate-100"}`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={n.icon} />
                </svg>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <form action="/api/auth/logout" method="post" className="mt-6 lg:absolute lg:bottom-6 lg:left-6 lg:right-6">
          <button className="w-full rounded-xl px-3 py-2 text-left text-[13px] text-ink-muted hover:bg-slate-100">Sign out</button>
        </form>
      </aside>
    </>
  );
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <BrandMark size={34} />
      <span className="leading-tight">
        <span className="block text-[16px] font-semibold tracking-tight">CloudSweep</span>
        <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">by Harlem Hustle</span>
      </span>
    </Link>
  );
}
