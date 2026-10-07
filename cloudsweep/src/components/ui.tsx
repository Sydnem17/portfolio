import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, intro, actions }: { title: string; intro?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight text-ink">{title}</h1>
        {intro && <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-ink-muted">{intro}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ children, className = "", pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return <section className={`rounded-2xl border border-line bg-white ${pad ? "p-5 sm:p-6" : ""} ${className}`}>{children}</section>;
}

export function CardTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold text-ink">{children}</h2>
      {aside}
    </div>
  );
}

export function Stat({ label, value, hint, tone = "ink" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "ink" | "bad" | "good" | "brand" }) {
  const colour = { ink: "text-ink", bad: "text-bad", good: "text-good", brand: "text-brand" }[tone];
  return (
    <Card>
      <p className="text-[13px] font-medium text-ink-muted">{label}</p>
      <p className={`mt-2 text-[24px] font-semibold leading-none tracking-tight sm:text-[30px] ${colour}`}>{value}</p>
      {hint && <p className="mt-2 text-[13px] text-ink-muted">{hint}</p>}
    </Card>
  );
}

export function Badge({ children, tone = "grey" }: { children: ReactNode; tone?: "grey" | "brand" | "good" | "warn" | "bad" | "violet" }) {
  const t = {
    grey: "bg-slate-100 text-slate-700",
    brand: "bg-brand-soft text-brand",
    good: "bg-emerald-50 text-emerald-700",
    warn: "bg-amber-50 text-amber-700",
    bad: "bg-red-50 text-red-700",
    violet: "bg-violet-50 text-violet-700",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${t}`}>{children}</span>;
}

const BTN = {
  primary: "bg-ink text-white hover:bg-black",
  brand: "bg-brand text-white hover:bg-blue-700",
  ghost: "border border-line bg-white text-ink hover:bg-slate-50",
  danger: "bg-bad text-white hover:bg-red-700",
};

export function buttonClass(variant: keyof typeof BTN = "primary", size: "sm" | "md" = "md") {
  return `inline-flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
    size === "sm" ? "px-3 py-1.5 text-[13px]" : "px-4 py-2.5 text-[14px]"
  } ${BTN[variant]}`;
}

export function LinkButton({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: keyof typeof BTN }) {
  return (
    <Link href={href} className={buttonClass(variant)}>
      {children}
    </Link>
  );
}

export function Meter({ value, max, colour = "#0B0D12" }: { value: number; max: number | null; colour?: string }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct > 90 ? "#DC2626" : colour }} />
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center py-14 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 18a4 4 0 0 1-.6-7.96A6 6 0 0 1 18 9.5a4.5 4.5 0 0 1-.5 8.5H7Z" /></svg>
      </div>
      <h3 className="text-[17px] font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-md text-[14px] leading-relaxed text-ink-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

export function Thumb({ id, alt, className = "" }: { id: string; alt: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/thumb/${encodeURIComponent(id)}`} alt={alt} loading="lazy" className={`bg-slate-100 object-cover ${className}`} />;
}
