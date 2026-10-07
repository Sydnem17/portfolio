"use client";

import { useEffect, useState } from "react";
import { bytes, date } from "@/lib/format";

export interface PreviewItem {
  id: string;
  name: string;
  kind: string;
  size?: number;
  accountLabel?: string;
  path?: string;
  webUrl?: string | null;
  takenAt?: string | null;
  caption?: string | null;
}

const TEXT_EXT = /\.(txt|md|csv|json|log|xml|yml|yaml|ini|html?|css|js|ts)$/i;

/** Unified preview: images, inline video/audio with seeking, PDFs and text — no page reloads. */
export function Lightbox({ items, index, onIndex, onClose }: { items: PreviewItem[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const it = items[index];
  const [text, setText] = useState<string | null>(null);
  const [fullFailed, setFullFailed] = useState(false);
  const src = `/api/preview/${encodeURIComponent(it.id)}`;

  useEffect(() => {
    setText(null);
    setFullFailed(false);
    if (TEXT_EXT.test(it.name))
      fetch(src, { headers: { Range: "bytes=0-65535" } })
        .then((r) => r.text())
        .then(setText)
        .catch(() => setText("Preview unavailable."));
  }, [it.id, it.name, src]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex(Math.min(items.length - 1, index + 1));
      if (e.key === "ArrowLeft") onIndex(Math.max(0, index - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, onClose, onIndex]);

  const pdf = /\.pdf$/i.test(it.name);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0E1016]/95 text-white backdrop-blur" role="dialog" aria-modal="true" onClick={onClose}>
      <header className="flex items-center justify-between gap-4 px-5 py-4" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">{it.name}</p>
          <p className="truncate text-[12px] text-white/55">
            {[it.accountLabel, it.path, it.size ? bytes(it.size) : null, it.takenAt ? date(it.takenAt) : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {it.webUrl && (
            <a href={it.webUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-white/15 px-3 py-1.5 text-[13px] hover:bg-white/10">
              Open in drive ↗
            </a>
          )}
          <button onClick={onClose} className="rounded-xl border border-white/15 px-3 py-1.5 text-[13px] hover:bg-white/10" aria-label="Close preview">
            ✕
          </button>
        </div>
      </header>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4 sm:px-16" onClick={(e) => e.stopPropagation()}>
        {it.kind === "image" ? (
          // Show the fast thumbnail immediately; swap to the full image when the browser can decode it (HEIC/RAW can't).
          // eslint-disable-next-line @next/next/no-img-element
          <img key={it.id} src={fullFailed ? `/api/thumb/${encodeURIComponent(it.id)}` : src} onError={() => setFullFailed(true)} alt={it.caption ?? it.name} className="max-h-full max-w-full rounded-xl object-contain" />
        ) : it.kind === "video" ? (
          <video key={it.id} src={src} controls autoPlay className="max-h-full max-w-full rounded-xl bg-black" />
        ) : it.kind === "audio" ? (
          <audio key={it.id} src={src} controls autoPlay className="w-full max-w-lg" />
        ) : pdf ? (
          <iframe key={it.id} src={src} title={it.name} className="h-full w-full max-w-4xl rounded-xl bg-white" />
        ) : text !== null ? (
          <pre className="h-full w-full max-w-4xl overflow-auto whitespace-pre-wrap rounded-xl bg-white/5 p-6 text-[13px] leading-relaxed text-white/85">{text}</pre>
        ) : (
          <div className="text-center text-white/60">
            <p className="text-[15px]">No inline preview for this file type.</p>
            {it.webUrl && <p className="mt-1 text-[13px]">Use “Open in drive” to view it with its native app.</p>}
          </div>
        )}
        {index > 0 && (
          <button onClick={() => onIndex(index - 1)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-[18px] hover:bg-white/20 sm:left-4" aria-label="Previous">
            ‹
          </button>
        )}
        {index < items.length - 1 && (
          <button onClick={() => onIndex(index + 1)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-[18px] hover:bg-white/20 sm:right-4" aria-label="Next">
            ›
          </button>
        )}
      </div>
      {it.caption && <p className="px-5 pb-5 text-center text-[13px] text-white/60" onClick={(e) => e.stopPropagation()}>{it.caption}</p>}
    </div>
  );
}
