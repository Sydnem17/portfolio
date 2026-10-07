"use client";

import { useEffect } from "react";
import type { DuplicateGroup, FileRow } from "@/lib/dedupe";
import { bytes, date, KIND_LABEL, accountColour } from "@/lib/format";

/**
 * Focused, dark split-screen triage: the copy being kept on the left, every other copy stacked
 * on the right. Keyboard: ← → move between sets · K keep highlighted · R toggle remove · Esc close.
 */
export function ReviewMode(props: {
  groups: DuplicateGroup[];
  index: number;
  keeperOf: (g: DuplicateGroup) => string;
  selected: Set<string>;
  onIndex: (i: number) => void;
  onKeep: (g: DuplicateGroup, id: string) => void;
  onToggle: (id: string, on?: boolean) => void;
  onClose: () => void;
}) {
  const { groups, index, keeperOf, selected, onIndex, onKeep, onToggle, onClose } = props;
  const g = groups[index];
  const keeperId = keeperOf(g);
  const keeper = g.members.find((m) => m.id === keeperId)!;
  const others = g.members.filter((m) => m.id !== keeperId);
  const canRemove = g.confidence !== "likely";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === "j") onIndex(Math.min(groups.length - 1, index + 1));
      if (e.key === "ArrowLeft" || e.key === "k") onIndex(Math.max(0, index - 1));
      if ((e.key === "a" || e.key === "Enter") && canRemove) {
        others.forEach((m) => onToggle(m.id, true));
        onIndex(Math.min(groups.length - 1, index + 1));
      }
      if (e.key === "s") onIndex(Math.min(groups.length - 1, index + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [groups.length, index, others, canRemove, onClose, onIndex, onToggle]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0E1016] text-white" role="dialog" aria-modal="true" aria-label="Review duplicates">
      <header className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-8">
        <div className="min-w-0">
          <p className="text-[12px] uppercase tracking-[0.14em] text-white/50">
            Set {index + 1} of {groups.length} · {KIND_LABEL[g.kind] ?? g.kind}
          </p>
          <h2 className="truncate text-[18px] font-semibold">{g.name}</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-[14px] text-white/60 sm:inline">
            Reclaim <b className="text-[#FF8A8A]">{bytes(g.wasteBytes)}</b>
          </span>
          <button onClick={onClose} className="rounded-xl border border-white/15 px-3 py-1.5 text-[13px] hover:bg-white/10">
            Done
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 sm:p-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <section className="rounded-3xl border border-emerald-400/30 bg-emerald-400/[0.06] p-5">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-3 py-1 text-[12px] font-medium text-emerald-300">● Keeping this copy</p>
          <Preview file={keeper} kind={g.kind} large />
          <Meta file={keeper} />
          {keeperId === g.keeperId && <p className="mt-3 text-[13px] text-white/60">Why: {g.keeperReasons.join(", ")}.</p>}
        </section>

        <section className="space-y-3">
          <p className="text-[13px] text-white/60">
            {others.length} other cop{others.length === 1 ? "y" : "ies"}
            {g.confidence === "similar" ? " — visually the same photo at a different size" : g.confidence === "likely" ? " — verify before removing" : " — byte-for-byte identical"}
          </p>
          {others.map((m) => {
            const on = selected.has(m.id);
            return (
              <div key={m.id} className={`flex gap-4 rounded-3xl border p-4 transition ${on ? "border-[#FF8A8A]/50 bg-[#FF8A8A]/[0.07]" : "border-white/10 bg-white/[0.03]"}`}>
                <Preview file={m} kind={g.kind} />
                <div className="min-w-0 flex-1">
                  <Meta file={m} compact />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => onKeep(g, m.id)} className="rounded-full border border-white/20 px-3.5 py-1.5 text-[13px] hover:bg-white/10">
                      Keep this instead
                    </button>
                    <button
                      disabled={!canRemove}
                      onClick={() => onToggle(m.id)}
                      className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition disabled:opacity-30 ${on ? "bg-[#FF8A8A] text-[#2A0B0B]" : "bg-white text-ink"}`}
                    >
                      {on ? "✓ Marked for removal" : "Remove"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-4 text-[13px] sm:px-8">
        <p className="hidden text-white/45 md:block">← → move · A remove all extras &amp; next · S skip · Esc close</p>
        <div className="flex gap-2">
          <button onClick={() => onIndex(Math.max(0, index - 1))} disabled={index === 0} className="rounded-full border border-white/15 px-4 py-2 disabled:opacity-30">
            Previous
          </button>
          <button onClick={() => onIndex(Math.min(groups.length - 1, index + 1))} className="rounded-full border border-white/15 px-4 py-2">
            Skip
          </button>
          <button
            disabled={!canRemove}
            onClick={() => {
              others.forEach((m) => onToggle(m.id, true));
              if (index < groups.length - 1) onIndex(index + 1);
              else onClose();
            }}
            className="rounded-full bg-white px-5 py-2 font-semibold text-ink disabled:opacity-30"
          >
            Remove extras &amp; next →
          </button>
        </div>
      </footer>
    </div>
  );
}

function Preview({ file, kind, large = false }: { file: FileRow; kind: string; large?: boolean }) {
  const cls = large ? (kind === "image" ? "aspect-[4/3] w-full rounded-2xl" : "h-32 w-full rounded-2xl") : "h-24 w-24 shrink-0 rounded-2xl";
  if (kind === "image")
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/thumb/${encodeURIComponent(file.id)}`} alt="" className={`${cls} bg-white/5 object-cover`} />;
  return <div className={`${cls} grid place-items-center bg-white/5 text-[13px] font-semibold uppercase tracking-wider text-white/40`}>{KIND_LABEL[kind] ?? kind}</div>;
}

function Meta({ file, compact = false }: { file: FileRow; compact?: boolean }) {
  return (
    <dl className={`grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px] ${compact ? "" : "mt-4"}`}>
      <dt className="text-white/45">Cloud</dt>
      <dd className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: accountColour(file.provider, file.accountLabel) }} />
        {file.accountLabel}
      </dd>
      <dt className="text-white/45">Folder</dt>
      <dd className="truncate" title={file.path}>{file.path.split("/").slice(0, -1).join("/") || "/"}</dd>
      <dt className="text-white/45">Size</dt>
      <dd>
        {bytes(file.size)}
        {file.width ? <span className="text-white/45"> · {file.width}×{file.height}</span> : null}
      </dd>
      <dt className="text-white/45">Modified</dt>
      <dd>{date(file.modifiedAt)}</dd>
    </dl>
  );
}
