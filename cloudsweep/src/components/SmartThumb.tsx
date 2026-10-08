"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Photo thumbnails, loaded politely. A page of photo collections can ask for 100+ thumbnails at once,
 * and Google Drive and OneDrive refuse some of a burst like that. So thumbnails load only when on
 * screen, a few at a time, retry once, and fall back to a tidy placeholder instead of a broken image.
 */
const MAX_AT_ONCE = 6;
let active = 0;
const waiting: Array<() => void> = [];
const acquire = () => new Promise<void>((resolve) => (active < MAX_AT_ONCE ? (active++, resolve()) : waiting.push(() => (active++, resolve()))));
const release = () => {
  active = Math.max(0, active - 1);
  waiting.shift()?.();
};

export function SmartThumb({ id, alt = "", className = "", fallbackClassName = "" }: { id: string; alt?: string; className?: string; fallbackClassName?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const attempt = useRef(0);
  const holding = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const el = ref.current;
    if (!el) return;
    const start = async () => {
      await acquire();
      if (cancelled) return release();
      holding.current = true;
      setSrc(`/api/thumb/${encodeURIComponent(id)}`);
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          void start();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
      if (holding.current) {
        holding.current = false;
        release();
      }
    };
  }, [id]);

  const done = () => {
    if (holding.current) {
      holding.current = false;
      release();
    }
  };
  const onError = () => {
    done();
    if (attempt.current++ === 0) {
      // One quiet retry after a pause usually gets through a provider's rate limit.
      setTimeout(async () => {
        await acquire();
        holding.current = true;
        setSrc(`/api/thumb/${encodeURIComponent(id)}?retry=1`);
      }, 1500 + Math.random() * 1500);
    } else setFailed(true);
  };

  if (failed)
    return (
      <span ref={ref} className={`grid place-items-center bg-slate-100 text-slate-400 ${fallbackClassName || className}`} role="img" aria-label={alt || "Preview unavailable"} title="Preview unavailable">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M4 5h16v14H4zM4 15l4-4 5 5 3-3 4 4M15 9.5h.01" />
        </svg>
      </span>
    );
  return (
    <span ref={ref} className={`block overflow-hidden bg-slate-100 ${src ? "" : "animate-pulse"} ${className}`}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} onLoad={done} onError={onError} className="h-full w-full object-cover" />
      )}
    </span>
  );
}
