"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { PhotoCollection } from "@/lib/photos/groups";
import { announceJobs } from "./JobDock";
import { SmartThumb } from "./SmartThumb";
import { startPhotoTagging } from "@/lib/photo-ai";
import { Lightbox, type PreviewItem } from "./Lightbox";
import { buttonClass, Card, Empty, PageHeader } from "./ui";

const PlaceMap = dynamic(() => import("./PlaceMap").then((m) => m.PlaceMap), { ssr: false, loading: () => <div className="h-[380px] animate-pulse rounded-2xl bg-slate-100" /> });

type Tab = "places" | "pets" | "people" | "events" | "scenes" | "things";
interface Data { total: number; analysed: number; located: number; gpsToCheck: number; lookalikePending: number; toTag: number; places: PhotoCollection[]; pets: PhotoCollection[]; people: PhotoCollection[]; events: PhotoCollection[]; scenes: PhotoCollection[]; things: PhotoCollection[] }

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "places", label: "Places", icon: "📍" },
  { id: "pets", label: "Pets & animals", icon: "🐾" },
  { id: "people", label: "People", icon: "👥" },
  { id: "events", label: "Events", icon: "🎉" },
  { id: "scenes", label: "Scenes", icon: "🏞️" },
  { id: "things", label: "Things", icon: "🔎" },
];

export function PhotosView({ vision }: { vision: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>("places");
  const [open, setOpen] = useState<string | null>(null);
  const [preview, setPreview] = useState<number | null>(null);

  const load = useCallback(() => fetch("/api/photos").then((r) => r.json()).then(setData), []);
  useEffect(() => {
    load();
    window.addEventListener("cloudsweep:changed", load);
    return () => window.removeEventListener("cloudsweep:changed", load);
  }, [load]);
  useEffect(() => setOpen(null), [tab]);
  const select = useCallback((k: string) => setOpen(k), []);

  if (!data) return <PageHeader title="Photos" intro="Gathering your photos from every drive…" />;
  if (!data.total)
    return (
      <>
        <PageHeader title="Photos" />
        <Empty title="No photos indexed yet" body="Connect a drive (or load the demo library) and CloudSweep will gather every photo into one browsable collection." />
      </>
    );

  const list = data[tab];
  const current = list.find((c) => c.key === open) ?? null;
  const items: PreviewItem[] = (current?.photos ?? []).map((p) => ({ id: p.id, name: p.name, kind: "image", accountLabel: p.accountLabel, takenAt: p.takenAt, caption: p.caption }));
  // Server: places (GPS read from each photo) and look-alikes. Device: pets, scenes and things, unless Claude is set up.
  const work = data.gpsToCheck + data.lookalikePending + (vision ? data.total - data.analysed : data.toTag);
  const analyse = async () => {
    await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "analyse" }) });
    announceJobs();
    if (!vision) startPhotoTagging();
  };

  return (
    <>
      <PageHeader
        title="Photos"
        intro={`${data.total.toLocaleString()} photos from every drive, organised by where they were taken and what's in them.`}
        actions={
          work > 0 && (
            <button className={buttonClass("brand")} onClick={analyse}>
              ✦ Analyse photos
            </button>
          )
        }
      />
      <div className="mb-6 grid gap-2 rounded-xl border border-line bg-white px-4 py-3 text-[13px] text-ink-soft sm:grid-cols-2">
        <p>
          📍 <b>{data.located.toLocaleString()}</b> of {data.total.toLocaleString()} photos have a location
          {data.gpsToCheck > 0 ? (
            <span className="text-ink-muted"> · {data.gpsToCheck.toLocaleString()} still to check</span>
          ) : data.located < data.total ? (
            <>
              {" · "}
              <button
                className="font-medium text-brand hover:underline"
                onClick={async () => {
                  await fetch("/api/photos/recheck-locations", { method: "POST" });
                  announceJobs();
                  load();
                }}
                title="Read the location saved inside every photo that doesn't have one yet"
              >
                Check locations again
              </button>
            </>
          ) : null}
        </p>
        <p>
          🐾 {vision ? "Pets, scenes and things by Claude" : "Pets, scenes and things by free AI on this device"}
          {!vision && data.toTag > 0 ? <span className="text-ink-muted"> · {data.toTag.toLocaleString()} to tag</span> : null}
        </p>
        {!vision && work > 0 && (
          <p className="text-[12px] text-ink-muted sm:col-span-2">
            Tagging runs on this phone or computer — your photos never leave it. Keep CloudSweep open while it works; you can use other pages.
          </p>
        )}
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto pb-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-[14px] font-medium transition ${tab === t.id ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-soft hover:border-ink/30"}`}
          >
            <span aria-hidden>{t.icon}</span>
            {t.label}
            <span className={`text-[12px] ${tab === t.id ? "text-white/60" : "text-ink-muted"}`}>{data[t.id].length}</span>
          </button>
        ))}
      </div>

      {tab === "people" && (
        <p className="-mt-2 mb-5 text-[13px] text-ink-muted">
          Grouped by how many people are in frame. Recognising <i>who</i> is in a photo needs face recognition, which is an opt-in feature coming next — it stays off until you enable it.
        </p>
      )}

      {list.length === 0 ? (
        <Empty
          title={`No ${tab} found yet`}
          body={
            tab === "places"
              ? data.gpsToCheck
                ? `${data.gpsToCheck.toLocaleString()} photos haven't been checked for a location yet. Tap “Analyse photos” to read where each one was taken.`
                : "None of your photos have location data saved in them. Turn on location for your phone's camera to have new photos placed on the map."
              : work > 0
                ? "Tap “Analyse photos” to let CloudSweep look inside your pictures."
                : "Nothing matched this category in your library."
          }
        />
      ) : tab === "places" ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <PlaceMap places={list} selected={open} onSelect={select} />
          <ul className="max-h-[380px] space-y-1 overflow-y-auto pr-1">
            {list.map((c) => (
              <li key={c.key}>
                <button onClick={() => setOpen(c.key)} className={`flex w-full items-center gap-3 rounded-xl p-2 text-left transition ${open === c.key ? "bg-ink text-white" : "hover:bg-white"}`}>
                  <SmartThumb id={c.photos[0].id} className="h-11 w-11 shrink-0 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{c.title}</span>
                    <span className={`text-[12px] ${open === c.key ? "text-white/60" : "text-ink-muted"}`}>{c.subtitle}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : tab === "pets" || tab === "people" ? (
        <div className="flex flex-wrap gap-6">
          {list.map((c) => (
            <button key={c.key} onClick={() => setOpen(c.key)} className="group w-28 text-center">
              <SmartThumb
                id={c.photos[0].id}
                className={`mx-auto h-24 w-24 rounded-full ring-offset-4 transition group-hover:scale-105 ${open === c.key ? "ring-[3px] ring-brand" : "ring-1 ring-line"}`}
              />
              <span className="mt-3 block truncate text-[14px] font-medium">{c.title}</span>
              <span className="block text-[12px] text-ink-muted">{c.subtitle}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((c) => (
            <button key={c.key} onClick={() => setOpen(c.key)} className={`overflow-hidden rounded-2xl border bg-white text-left transition hover:-translate-y-0.5 hover:shadow-md ${open === c.key ? "border-brand ring-2 ring-brand/20" : "border-line"}`}>
              <div className="grid aspect-[4/3] grid-cols-2 gap-0.5 bg-slate-100">
                {c.photos.slice(0, 4).map((p) => (
                  <SmartThumb key={p.id} id={p.id} className="h-full w-full" />
                ))}
              </div>
              <div className="p-3">
                <p className="truncate text-[14px] font-medium">{c.title}</p>
                <p className="text-[12px] text-ink-muted">{c.subtitle}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {current && (
        <Card className="mt-8">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-[18px] font-semibold">{current.title}</h2>
            <p className="text-[13px] text-ink-muted">
              {current.count.toLocaleString()} photos{current.count > current.photos.length ? ` · showing ${current.photos.length} most recent` : ""}
            </p>
          </div>
          <div className="columns-2 gap-3 sm:columns-3 lg:columns-4">
            {current.photos.map((p, i) => (
              <button key={p.id} onClick={() => setPreview(i)} className="group relative mb-3 block w-full overflow-hidden rounded-xl bg-slate-100">
                <SmartThumb id={p.id} alt={p.caption ?? p.name} className="aspect-square w-full transition duration-300 group-hover:scale-[1.03]" />
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-3 pb-2 pt-6 text-left text-[12px] text-white opacity-0 transition group-hover:opacity-100">
                  {p.caption ?? p.name} · {p.accountLabel}
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {preview !== null && items[preview] && <Lightbox items={items} index={preview} onIndex={setPreview} onClose={() => setPreview(null)} />}
    </>
  );
}
