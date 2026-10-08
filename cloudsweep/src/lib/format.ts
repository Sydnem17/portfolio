export function bytes(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB", "PB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) (v /= 1024), i++;
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`;
}

export function date(s: string | null | undefined): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export function ago(s: string | null | undefined): string {
  if (!s) return "never";
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}

export const KIND_LABEL: Record<string, string> = {
  image: "Photos",
  video: "Videos",
  document: "Documents",
  audio: "Audio",
  archive: "Archives",
  other: "Other",
};

export const KIND_COLOUR: Record<string, string> = {
  image: "#2F5BFF",
  video: "#8B5CF6",
  document: "#0E9F6E",
  audio: "#F59E0B",
  archive: "#EF4444",
  other: "#94A3B8",
};

export const PROVIDER_COLOUR: Record<string, string> = {
  onedrive: "#0A64D6",
  google: "#1E8E3E",
  dropbox: "#0061FE",
  demo: "#6B7280",
};

/** Brand colour for an account; demo accounts borrow the colour of the service they simulate. */
export function accountColour(provider: string, label = ""): string {
  if (provider !== "demo") return PROVIDER_COLOUR[provider] ?? "#6B7280";
  if (/onedrive/i.test(label)) return PROVIDER_COLOUR.onedrive;
  if (/google/i.test(label)) return PROVIDER_COLOUR.google;
  if (/dropbox/i.test(label)) return PROVIDER_COLOUR.dropbox;
  return PROVIDER_COLOUR.demo;
}
