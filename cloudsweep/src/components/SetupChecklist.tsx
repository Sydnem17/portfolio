import type { SetupIssue } from "@/lib/setup";

export function SetupChecklist({ issues }: { issues: SetupIssue[] }) {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-warn">Almost there</p>
      <h1 className="mt-2 text-[28px] font-semibold tracking-tight">Finish setting up CloudSweep</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
        The site is running, but {issues.length === 1 ? "one setting needs" : `${issues.length} settings need`} attention. Add or fix {issues.length === 1 ? "it" : "them"} in your hosting
        dashboard (Vercel: <b>Settings → Environment Variables</b>), then <b>redeploy</b> — settings only take effect on a new deploy.
      </p>
      <ol className="mt-8 space-y-4">
        {issues.map((i, n) => (
          <li key={i.key} className="rounded-2xl border border-line bg-white p-5">
            <p className="text-[15px]">
              <span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-ink text-[12px] font-semibold text-white">{n + 1}</span>
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[14px] font-semibold">{i.key}</code> {i.problem}
            </p>
            <p className="mt-2 pl-8 text-[14px] leading-relaxed text-ink-soft">{i.fix}</p>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-[13px] text-ink-muted">Your cloud files are untouched — CloudSweep can&apos;t read or change anything until setup is complete and you connect a drive.</p>
    </div>
  );
}
