"use client";

import { runInBrowser } from "@/components/LocalScanManager";
import { GRAPHIC_TAGS, looksLikeGraphic, pixelStats, toTags, type BrowserTags } from "./photo-labels";

/**
 * Free photo tagging that runs on this device. Two small open models (COCO-SSD for objects,
 * MobileNet v2 for the scene and breed) download once from Google's public model store and are
 * cached by the browser. Photos are read from CloudSweep's own thumbnails and never sent anywhere.
 */
const MOBILENET_URL = "https://storage.googleapis.com/tfjs-models/savedmodel/mobilenet_v2_1.0_224/model.json";
export const PHOTO_AI_TASK = "photo-ai";

type Models = { detect: (img: HTMLImageElement) => Promise<{ class: string; score: number }[]>; classify: (img: HTMLImageElement) => Promise<{ className: string; probability: number }[]> };
let models: Promise<Models> | null = null;

export function loadModels(): Promise<Models> {
  models ??= (async () => {
    const tf = await import("@tensorflow/tfjs-core");
    await import("@tensorflow/tfjs-backend-webgl");
    await import("@tensorflow/tfjs-backend-cpu");
    await import("@tensorflow/tfjs-converter");
    if (!(await tf.setBackend("webgl").catch(() => false))) await tf.setBackend("cpu");
    await tf.ready();
    const [coco, mobilenet] = await Promise.all([import("@tensorflow-models/coco-ssd"), import("@tensorflow-models/mobilenet")]);
    const [detector, classifier] = await Promise.all([
      coco.load({ base: "lite_mobilenet_v2" }),
      mobilenet.load({ version: 2, alpha: 1, modelUrl: MOBILENET_URL, inputRange: [0, 1] }),
    ]);
    return { detect: (img: HTMLImageElement) => detector.detect(img, 20, 0.3), classify: (img: HTMLImageElement) => classifier.classify(img, 5) };
  })().catch((err) => {
    models = null; // let the next attempt retry (e.g. after reconnecting)
    throw err;
  });
  return models;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => (img.naturalWidth ? resolve(img) : reject(new Error("empty image")));
    img.onerror = () => reject(new Error("thumbnail unavailable"));
    img.src = url;
  });
}

/** Colour spread of a picture, measured on a tiny copy (cheap, and enough to tell flat graphics from photos). */
function statsOf(img: HTMLImageElement) {
  const c = document.createElement("canvas");
  c.width = c.height = 48;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, 48, 48);
  return pixelStats(ctx.getImageData(0, 0, 48, 48).data);
}

export async function tagPhoto(thumbUrl: string, file: { name: string; mime?: string | null } = { name: "" }): Promise<BrowserTags> {
  const img = await loadImage(thumbUrl);
  // Logos, designs and screenshots fool both models ("scissors", "cup"…), so file them as graphics.
  if (looksLikeGraphic(file, statsOf(img))) return { ...GRAPHIC_TAGS };
  const m = await loadModels();
  const [d, p] = await Promise.all([m.detect(img), m.classify(img)]);
  return toTags(d, p);
}

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `Request failed (${r.status})`);
  return r.json();
}

/** Tags every untagged photo, in batches, while this tab is open. Safe to call again: it resumes. */
export function startPhotoTagging(): boolean {
  return runInBrowser(PHOTO_AI_TASK, "Tagging photos (free AI on this device)", async (signal, report) => {
    report({ message: "Downloading the free AI (about 30 MB, first time only)…" });
    await loadModels();
    let done = 0;
    let found = 0;
    for (;;) {
      const r = await fetch("/api/photos/untagged?limit=24").then((x) => x.json());
      const items: Array<{ id: string; name: string; mime: string | null }> = r.items ?? [];
      if (!items.length) break;
      const total = done + r.remaining;
      const results: unknown[] = [];
      for (const { id, name, mime } of items) {
        if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
        try {
          const t = await tagPhoto(`/api/thumb/${encodeURIComponent(id)}`, { name, mime });
          if (t.pets.length || t.scene || t.event || t.people_count || t.things.length) found++;
          results.push({ id, ...t });
        } catch {
          results.push({ id, failed: true }); // no thumbnail: don't retry it forever
        }
        done++;
        report({ message: `Looking at photos · ${done.toLocaleString()} of ${total.toLocaleString()}`, done, total });
      }
      await post("/api/photos/tags", { tags: results });
      window.dispatchEvent(new Event("cloudsweep:changed"));
    }
    return done ? `Tagged ${done.toLocaleString()} photos (${found.toLocaleString()} with pets, people, scenes or things)` : "Every photo is already tagged";
  });
}
