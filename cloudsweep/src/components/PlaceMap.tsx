"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { PhotoCollection } from "@/lib/photos/groups";

/** Clean, low-noise basemap with photo-count bubbles; nearby bubbles merge as you zoom out. */
export function PlaceMap({ places, selected, onSelect }: { places: PhotoCollection[]; selected: string | null; onSelect: (key: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const layer = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      if (!map.current) {
        map.current = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, worldCopyJump: true });
        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
          maxZoom: 18,
        }).addTo(map.current);
        map.current.on("zoomend", () => draw());
      }
      const geo = places.filter((p) => p.lat != null);
      if (geo.length) map.current.fitBounds(L.latLngBounds(geo.map((p) => [p.lat!, p.lng!])), { padding: [40, 40], maxZoom: 11 });
      else map.current.setView([-25.3, 134], 3);
      draw();

      function draw() {
        layer.current?.remove();
        layer.current = L.layerGroup().addTo(map.current);
        // Screen-space clustering: merge places whose bubbles would overlap at this zoom.
        const clusters: Array<{ x: number; y: number; items: PhotoCollection[] }> = [];
        for (const p of geo) {
          const pt = map.current.latLngToLayerPoint([p.lat!, p.lng!]);
          const near = clusters.find((c) => Math.hypot(c.x - pt.x, c.y - pt.y) < 56);
          near ? near.items.push(p) : clusters.push({ x: pt.x, y: pt.y, items: [p] });
        }
        for (const c of clusters) {
          const count = c.items.reduce((s, p) => s + p.count, 0);
          const lead = c.items.sort((a, b) => b.count - a.count)[0];
          const size = Math.min(72, 38 + Math.sqrt(count) * 4);
          const active = c.items.some((p) => p.key === selected);
          const thumb = lead.photos[0] ? `/api/thumb/${encodeURIComponent(lead.photos[0].id)}` : "";
          const icon = L.divIcon({
            className: "",
            iconSize: [size, size],
            html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;border:3px solid ${active ? "#2F5BFF" : "#fff"};box-shadow:0 6px 18px rgba(11,13,18,.25);background:#E6E8EC url('${thumb}') center/cover;position:relative">
                     <span style="position:absolute;right:-6px;bottom:-6px;background:#0B0D12;color:#fff;font:600 11px Inter,sans-serif;padding:2px 7px;border-radius:9999px">${count}</span></div>`,
          });
          const marker = L.marker(map.current.layerPointToLatLng([c.x, c.y]), { icon, title: c.items.map((p) => p.title).join(", ") }).addTo(layer.current);
          marker.on("click", () => (c.items.length > 1 ? map.current.setView(marker.getLatLng(), map.current.getZoom() + 3) : onSelect(lead.key)));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [places, selected, onSelect]);

  useEffect(() => () => map.current?.remove(), []);
  return <div ref={el} className="h-[380px] w-full overflow-hidden rounded-2xl border border-line" />;
}
