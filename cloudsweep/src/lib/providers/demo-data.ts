/**
 * Deterministic demo library spread across three simulated accounts:
 * OneDrive, Google Drive (personal) and Google Drive (work). It deliberately contains
 * exact duplicates, renamed copies, resized photos, duplicated folders and a large
 * duplicated video, so every CloudSweep feature has something real to work on.
 */
export interface DemoFile {
  remoteId: string;
  parentRemoteId: string | null;
  name: string;
  isFolder: boolean;
  size: number;
  mime: string | null;
  contentKey: string | null;
  /** "full": provider reports md5/sha1/sha256. "quickxor": OneDrive work/school style (quickXor only). */
  hashMode: "full" | "quickxor";
  modifiedAt: string;
  createdAt: string;
  takenAt?: string | null;
  location?: { lat: number; lng: number } | null;
  scene?: string;
  shot?: number;
  width?: number;
  height?: number;
  trashed?: boolean;
}

export interface DemoAccountSpec {
  key: "onedrive" | "gpersonal" | "gwork";
  label: string;
  email: string;
  displayName: string;
  quotaTotal: number;
}

export const DEMO_ACCOUNTS: DemoAccountSpec[] = [
  { key: "onedrive", label: "OneDrive", email: "alex@outlook.com", displayName: "Alex Morgan", quotaTotal: 100 * 1024 ** 3 },
  { key: "gpersonal", label: "Google Drive – Personal", email: "alex.morgan@gmail.com", displayName: "Alex Morgan", quotaTotal: 15 * 1024 ** 3 },
  { key: "gwork", label: "Google Drive – Work", email: "alex.morgan@northwind.com.au", displayName: "Alex Morgan", quotaTotal: 2048 * 1024 ** 3 },
];

export interface Scene {
  key: string;
  palette: [string, string, string];
  place?: { label: string; lat: number; lng: number };
  tags: { people: number; pets: Array<{ species: string; description: string }>; things: string[]; scene: string; event?: string; caption: string };
}

export const SCENES: Scene[] = [
  { key: "bondi", palette: ["#7CC6FE", "#F4D58D", "#2E86AB"], place: { label: "Bondi Beach, Sydney", lat: -33.8915, lng: 151.2767 },
    tags: { people: 2, pets: [], things: ["surfboard", "ocean", "sand"], scene: "beach", caption: "Two people walking along Bondi Beach" } },
  { key: "harbour", palette: ["#FF9F1C", "#2EC4B6", "#011627"], place: { label: "Sydney Harbour", lat: -33.8568, lng: 151.2153 },
    tags: { people: 0, pets: [], things: ["opera house", "bridge", "sunset"], scene: "cityscape", caption: "Sunset over Sydney Harbour" } },
  { key: "laneway", palette: ["#3D348B", "#F18701", "#E6AF2E"], place: { label: "Melbourne CBD", lat: -37.8136, lng: 144.9631 },
    tags: { people: 1, pets: [], things: ["coffee", "street art"], scene: "street", caption: "Coffee in a Melbourne laneway" } },
  { key: "uluru", palette: ["#C1440E", "#F2A65A", "#5B8E7D"], place: { label: "Uluru, Northern Territory", lat: -25.3444, lng: 131.0369 },
    tags: { people: 3, pets: [], things: ["rock formation", "desert"], scene: "landscape", event: "holiday", caption: "Family at Uluru at dusk" } },
  { key: "kyoto", palette: ["#D62828", "#F77F00", "#003049"], place: { label: "Kyoto, Japan", lat: 35.0116, lng: 135.7681 },
    tags: { people: 2, pets: [], things: ["temple", "torii gate"], scene: "landmark", event: "holiday", caption: "Torii gates in Kyoto" } },
  { key: "bluemtns", palette: ["#264653", "#2A9D8F", "#8AB17D"], place: { label: "Blue Mountains, NSW", lat: -33.7125, lng: 150.3119 },
    tags: { people: 2, pets: [{ species: "dog", description: "golden retriever" }], things: ["hiking trail", "lookout"], scene: "nature", caption: "Hiking with the dog in the Blue Mountains" } },
  { key: "dogpark", palette: ["#606C38", "#DDA15E", "#FEFAE0"], place: { label: "Centennial Park, Sydney", lat: -33.8986, lng: 151.2339 },
    tags: { people: 0, pets: [{ species: "dog", description: "golden retriever" }], things: ["ball", "grass"], scene: "park", caption: "Golden retriever chasing a ball" } },
  { key: "catsofa", palette: ["#6D597A", "#B56576", "#EAAC8B"],
    tags: { people: 0, pets: [{ species: "cat", description: "grey tabby cat" }], things: ["sofa", "cushion"], scene: "indoors", caption: "Grey tabby asleep on the sofa" } },
  { key: "bbq", palette: ["#9C6644", "#E9C46A", "#264653"],
    tags: { people: 5, pets: [{ species: "dog", description: "golden retriever" }], things: ["barbecue", "food"], scene: "backyard", event: "family gathering", caption: "Family barbecue in the backyard" } },
  { key: "birthday", palette: ["#FF006E", "#FB5607", "#FFBE0B"],
    tags: { people: 4, pets: [], things: ["cake", "candles", "balloons"], scene: "indoors", event: "birthday", caption: "Blowing out birthday candles" } },
  { key: "wedding", palette: ["#F8EDEB", "#E8A598", "#6D6875"], place: { label: "Hunter Valley, NSW", lat: -32.7869, lng: 151.3046 },
    tags: { people: 12, pets: [], things: ["flowers", "vineyard"], scene: "outdoors", event: "wedding", caption: "Wedding guests at a Hunter Valley vineyard" } },
  { key: "whiteboard", palette: ["#FFFFFF", "#1D3557", "#E63946"],
    tags: { people: 0, pets: [], things: ["whiteboard", "diagram"], scene: "office", caption: "Whiteboard from a planning session" } },
];

// mulberry32 — tiny deterministic PRNG so the demo library is identical every time.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MB = 1024 * 1024;

export function buildDemoLibrary(): Record<DemoAccountSpec["key"], DemoFile[]> {
  const rand = rng(20261007);
  const out: Record<string, DemoFile[]> = { onedrive: [], gpersonal: [], gwork: [] };
  let n = 0;
  const id = (acct: string) => `${acct}-${(++n).toString(36).padStart(5, "0")}`;
  const folders: Record<string, Record<string, string>> = { onedrive: {}, gpersonal: {}, gwork: {} };

  const folder = (acct: string, path: string): string => {
    if (!path) return `${acct}-root`;
    if (folders[acct][path]) return folders[acct][path];
    const parts = path.split("/");
    const parent = folder(acct, parts.slice(0, -1).join("/"));
    const rid = id(acct);
    folders[acct][path] = rid;
    out[acct].push({ remoteId: rid, parentRemoteId: parent, name: parts.at(-1)!, isFolder: true, size: 0, mime: null, contentKey: null, hashMode: "full", modifiedAt: "2024-01-01T00:00:00Z", createdAt: "2024-01-01T00:00:00Z" });
    return rid;
  };
  for (const a of Object.keys(out)) out[a].push({ remoteId: `${a}-root`, parentRemoteId: null, name: "", isFolder: true, size: 0, mime: null, contentKey: null, hashMode: "full", modifiedAt: "2020-01-01T00:00:00Z", createdAt: "2020-01-01T00:00:00Z" });

  const file = (acct: string, path: string, f: Omit<DemoFile, "remoteId" | "parentRemoteId" | "name" | "isFolder" | "hashMode"> & { hashMode?: DemoFile["hashMode"] }) => {
    const parts = path.split("/");
    out[acct].push({ remoteId: id(acct), parentRemoteId: folder(acct, parts.slice(0, -1).join("/")), name: parts.at(-1)!, isFolder: false, hashMode: f.hashMode ?? "full", ...f });
  };

  // ── Photos ────────────────────────────────────────────────────────────────
  let imgNo = 2140;
  const shots: Array<{ scene: Scene; shot: number; name: string; size: number; takenAt: string; year: number }> = [];
  SCENES.forEach((scene, si) => {
    const count = 4 + Math.floor(rand() * 5);
    const year = 2019 + (si % 6);
    for (let s = 0; s < count; s++) {
      const month = 1 + ((si * 3 + s) % 12);
      shots.push({
        scene,
        shot: s,
        name: `IMG_${imgNo++}.jpg`,
        size: Math.round((2.2 + rand() * 4.5) * MB),
        takenAt: `${year}-${String(month).padStart(2, "0")}-${String(1 + ((s * 5) % 27)).padStart(2, "0")}T0${s % 9}:1${s % 6}:00Z`,
        year,
      });
    }
  });

  for (const [i, sh] of shots.entries()) {
    const base = {
      size: sh.size,
      mime: "image/jpeg",
      contentKey: `photo:${sh.scene.key}:${sh.shot}`,
      modifiedAt: sh.takenAt,
      createdAt: sh.takenAt,
      takenAt: sh.takenAt,
      location: sh.scene.place ? { lat: sh.scene.place.lat + (rand() - 0.5) * 0.01, lng: sh.scene.place.lng + (rand() - 0.5) * 0.01 } : null,
      scene: sh.scene.key,
      shot: sh.shot,
      width: 4032,
      height: 3024,
    };
    // Every photo lives in OneDrive's camera roll (phone auto-upload).
    file("onedrive", `Pictures/Camera Roll/${sh.year}/${sh.name}`, base);
    // ~60% were also backed up to Google Drive personal (exact duplicates).
    if (rand() < 0.6) file("gpersonal", `Google Photos backup/${sh.year}/${sh.name}`, { ...base, createdAt: "2023-03-02T09:00:00Z" });
    // Some were shared over messaging apps and re-saved: resized near-duplicates.
    if (i % 4 === 0)
      file("gpersonal", `Downloads/${sh.name.replace(".jpg", "")} (1).jpg`, {
        ...base,
        contentKey: `photo:${sh.scene.key}:${sh.shot}:resized`,
        size: Math.round(sh.size * 0.22),
        width: 1600,
        height: 1200,
        location: null,
      });
    // Holiday 2019 folder copied wholesale into work Drive at some point.
    if (sh.scene.key === "uluru" || sh.scene.key === "kyoto")
      file("gwork", `Personal (move me)/Holiday Photos/${sh.name}`, { ...base, hashMode: "full", createdAt: "2022-11-20T03:00:00Z" });
  }

  // ── Videos ────────────────────────────────────────────────────────────────
  const wedding = { size: 1840 * MB, mime: "video/mp4", contentKey: "video:wedding", modifiedAt: "2021-04-18T08:00:00Z", createdAt: "2021-04-18T08:00:00Z", width: 3840, height: 2160 };
  file("onedrive", "Videos/Wedding highlights.mp4", wedding);
  file("gpersonal", "Wedding/Wedding highlights.mp4", { ...wedding, createdAt: "2021-05-02T08:00:00Z" });
  file("gpersonal", "Backups/Wedding highlights - Copy.mp4", { ...wedding, createdAt: "2023-01-09T08:00:00Z" });
  const kids = { size: 640 * MB, mime: "video/mp4", contentKey: "video:birthday", modifiedAt: "2022-08-11T08:00:00Z", createdAt: "2022-08-11T08:00:00Z" };
  file("onedrive", "Videos/Mia 5th birthday.mov", kids);
  file("gpersonal", "Videos/Mia 5th birthday.mov", kids);

  // ── Documents ─────────────────────────────────────────────────────────────
  const docs: Array<[string, number, string]> = [
    ["Tax Return 2023-24.pdf", 1.4, "application/pdf"],
    ["Lease Agreement - Surry Hills.pdf", 3.1, "application/pdf"],
    ["Resume - Alex Morgan.docx", 0.18, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["Household Budget.xlsx", 0.09, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["Passport scan.pdf", 2.2, "application/pdf"],
    ["Car insurance renewal.pdf", 0.6, "application/pdf"],
  ];
  for (const [name, mb, mime] of docs) {
    const d = { size: Math.round(mb * MB), mime, contentKey: `doc:${name}`, modifiedAt: "2024-07-30T00:00:00Z", createdAt: "2024-07-30T00:00:00Z" };
    file("onedrive", `Documents/${name}`, d);
    if (rand() < 0.7) file("gpersonal", `Documents/${name}`, d);
    if (rand() < 0.5) file("gpersonal", `Documents/Copy of ${name}`, { ...d, createdAt: "2024-09-01T00:00:00Z" });
  }
  // Work files: the work OneDrive-style hashes are quickXor only, so matches need content verification.
  const work: Array<[string, number]> = [["Q3 Board Pack.pptx", 18], ["Operating Model v7.docx", 2.4], ["Learning Strategy 2026.pdf", 5.2], ["Brand Guidelines.pdf", 31]];
  for (const [name, mb] of work) {
    const d = { size: Math.round(mb * MB), mime: null, contentKey: `work:${name}`, modifiedAt: "2025-02-11T00:00:00Z", createdAt: "2025-02-11T00:00:00Z" };
    file("gwork", `Shared Projects/${name}`, d);
    file("onedrive", `Work stuff/${name}`, { ...d, hashMode: "quickxor" });
  }

  // ── Archives & clutter ────────────────────────────────────────────────────
  const zip = { size: Math.round(4.2 * 1024 * MB), mime: "application/zip", contentKey: "zip:photos-2019", modifiedAt: "2020-02-01T00:00:00Z", createdAt: "2020-02-01T00:00:00Z" };
  file("gpersonal", "Backups/Photos backup 2019.zip", zip);
  file("onedrive", "Archive/Photos backup 2019.zip", zip);
  for (let i = 0; i < 6; i++)
    file("gwork", `Downloads/setup_installer_${i}.exe`, { size: Math.round((80 + rand() * 120) * MB), mime: "application/octet-stream", contentKey: `junk:${i % 3}`, modifiedAt: "2025-05-05T00:00:00Z", createdAt: "2025-05-05T00:00:00Z" });

  return out as Record<DemoAccountSpec["key"], DemoFile[]>;
}

export function sceneByKey(key: string | undefined): Scene | undefined {
  return SCENES.find((s) => s.key === key);
}
