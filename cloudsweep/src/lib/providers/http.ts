import { ProviderError } from "./types";

/** fetch with retry on 429/5xx (honours Retry-After) and typed errors. */
export async function http(url: string, init: RequestInit & { retries?: number } = {}): Promise<Response> {
  const retries = init.retries ?? 4;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      if (attempt >= retries) throw new ProviderError(`Network error: ${(err as Error).message}`, undefined, true);
      await sleep(backoff(attempt));
      continue;
    }
    if (res.ok || res.status === 308) return res;
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < retries) {
      const after = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 30000) : backoff(attempt));
      continue;
    }
    const body = await res.text().catch(() => "");
    throw new ProviderError(`${init.method ?? "GET"} ${new URL(url).pathname} → ${res.status}: ${body.slice(0, 300)}`, res.status, retryable);
  }
}

export async function json<T = any>(url: string, init: RequestInit & { retries?: number } = {}): Promise<T> {
  const res = await http(url, init);
  return (await res.json()) as T;
}

export function bearer(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${token}`, ...extra };
}

export async function tokenRequest(url: string, body: Record<string, string>) {
  const res = await http(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    retries: 2,
  });
  const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    scope: data.scope,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const backoff = (attempt: number) => Math.min(1000 * 2 ** attempt, 16000) + Math.random() * 250;
