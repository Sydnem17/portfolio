import "server-only";
import { decrypt, encrypt, newId } from "./crypto";
import { num, one, query } from "./db";
import { getProvider } from "./providers";
import { buildDemoLibrary, DEMO_ACCOUNTS } from "./providers/demo-data";
import type { OAuthTokens, ProviderContext } from "./providers/types";

export interface Account {
  id: string;
  provider: string;
  label: string;
  email: string | null;
  display_name: string | null;
  quota_total: number | null;
  quota_used: number | null;
  is_primary: boolean;
  status: string;
  last_scan_at: string | null;
  created_at: string;
}

export async function listAccounts(): Promise<Account[]> {
  const rows = await query<any>(
    "SELECT id, provider, label, email, display_name, quota_total, quota_used, is_primary, status, last_scan_at, created_at FROM accounts ORDER BY is_primary DESC, created_at",
  );
  return rows.map((r) => ({ ...r, quota_total: r.quota_total == null ? null : num(r.quota_total), quota_used: r.quota_used == null ? null : num(r.quota_used) }));
}

export async function getAccount(id: string): Promise<Account | null> {
  return (await listAccounts()).find((a) => a.id === id) ?? null;
}

function readTokens(enc: string | null): OAuthTokens {
  if (!enc) throw new Error("Account has no stored credentials; reconnect it.");
  return JSON.parse(decrypt(enc));
}

/** Builds a provider context that transparently refreshes and re-stores access tokens. */
export async function contextFor(accountId: string): Promise<ProviderContext> {
  const row = await one<{ provider: string; tokens_enc: string | null }>("SELECT provider, tokens_enc FROM accounts WHERE id = $1", [accountId]);
  if (!row) throw new Error("Account not found");
  const provider = getProvider(row.provider);
  let tokens = readTokens(row.tokens_enc);
  return {
    accountId,
    extra: tokens.extra,
    async token() {
      if (tokens.expiresAt - Date.now() < 120_000) {
        try {
          tokens = { ...(await provider.refresh(tokens)), extra: tokens.extra };
          await query("UPDATE accounts SET tokens_enc = $2, status = 'connected' WHERE id = $1", [accountId, encrypt(JSON.stringify(tokens))]);
        } catch (err) {
          await query("UPDATE accounts SET status = 'reauth' WHERE id = $1", [accountId]);
          throw err;
        }
      }
      return tokens.accessToken;
    },
  };
}

export async function saveConnectedAccount(providerId: string, tokens: OAuthTokens): Promise<string> {
  const provider = getProvider(providerId);
  const id = newId("acc");
  await query("INSERT INTO accounts (id, provider, label, tokens_enc) VALUES ($1, $2, $3, $4)", [id, providerId, provider.name, encrypt(JSON.stringify(tokens))]);
  const ctx = await contextFor(id);
  const p = await provider.profile(ctx);
  // Reconnecting the same login replaces the old record instead of duplicating it.
  const existing = p.email
    ? await one<{ id: string }>("SELECT id FROM accounts WHERE provider = $1 AND email = $2 AND id <> $3", [providerId, p.email, id])
    : null;
  if (existing) {
    await query("UPDATE accounts SET tokens_enc = $2, status = 'connected', quota_total = $3, quota_used = $4 WHERE id = $1", [existing.id, encrypt(JSON.stringify(tokens)), p.quotaTotal, p.quotaUsed]);
    await query("DELETE FROM accounts WHERE id = $1", [id]);
    return existing.id;
  }
  const label = await uniqueLabel(defaultLabel(provider.name, p.email), id);
  await query("UPDATE accounts SET email = $2, display_name = $3, quota_total = $4, quota_used = $5, label = $6 WHERE id = $1", [id, p.email, p.displayName, p.quotaTotal, p.quotaUsed, label]);
  await ensurePrimary();
  return id;
}

/** "Google Drive – sydnemradd": the login name keeps several accounts of one service apart. */
function defaultLabel(name: string, email: string | null): string {
  const who = email?.split("@")[0];
  return who ? `${name} – ${who}` : name;
}

/** Appends " (2)", " (3)"… until no other account uses the name. */
export async function uniqueLabel(base: string, excludeId?: string): Promise<string> {
  const taken = new Set(
    (await query<{ label: string }>("SELECT label FROM accounts WHERE id IS DISTINCT FROM $1", [excludeId ?? null])).map((r) => r.label.trim().toLowerCase()),
  );
  let label = base.trim().slice(0, 80);
  for (let n = 2; taken.has(label.toLowerCase()); n++) label = `${base.trim().slice(0, 74)} (${n})`;
  return label;
}

async function ensurePrimary() {
  const p = await one("SELECT id FROM accounts WHERE is_primary");
  if (!p) await query("UPDATE accounts SET is_primary = TRUE WHERE id = (SELECT id FROM accounts ORDER BY created_at LIMIT 1)");
}

export async function setPrimary(id: string) {
  await query("UPDATE accounts SET is_primary = (id = $1)", [id]);
}

/** Renames a storage account. Names must be non-empty and unique (ignoring case) so every drive can be told apart. */
export async function renameAccount(id: string, label: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = label.replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, error: "Give the drive a name." };
  if (name.length > 80) return { ok: false, error: "Keep the name under 80 characters." };
  const clash = await one<{ id: string }>("SELECT id FROM accounts WHERE lower(label) = lower($1) AND id <> $2", [name, id]);
  if (clash) return { ok: false, error: `Another drive is already called "${name}". Choose a different name.` };
  await query("UPDATE accounts SET label = $2 WHERE id = $1", [id, name]);
  return { ok: true };
}

export async function removeAccount(id: string) {
  await query("DELETE FROM demo_files WHERE account_id = $1", [id]);
  await query("DELETE FROM accounts WHERE id = $1", [id]);
  await ensurePrimary();
}

export async function refreshQuota(id: string) {
  const a = await one<{ provider: string }>("SELECT provider FROM accounts WHERE id = $1", [id]);
  if (!a) return;
  const p = await getProvider(a.provider).profile(await contextFor(id));
  await query("UPDATE accounts SET quota_total = $2, quota_used = $3 WHERE id = $1", [id, p.quotaTotal, p.quotaUsed]);
}

/** Creates the three simulated demo accounts and their libraries. Idempotent. */
export async function createDemoAccounts(): Promise<string[]> {
  const existing = await query<{ id: string }>("SELECT id FROM accounts WHERE provider = 'demo'");
  if (existing.length) return existing.map((r) => r.id);
  const lib = buildDemoLibrary();
  const ids: string[] = [];
  for (const spec of DEMO_ACCOUNTS) {
    const id = `demo-${spec.key}`;
    const tokens: OAuthTokens = {
      accessToken: "demo",
      expiresAt: Date.now() + 365 * 864e5,
      extra: { email: spec.email, displayName: spec.displayName, quotaTotal: String(spec.quotaTotal) },
    };
    await query("INSERT INTO accounts (id, provider, label, email, display_name, quota_total, tokens_enc) VALUES ($1, 'demo', $2, $3, $4, $5, $6)", [
      id, spec.label, spec.email, spec.displayName, spec.quotaTotal, encrypt(JSON.stringify(tokens)),
    ]);
    const files = lib[spec.key].map((f) => ({ ...f, remoteId: f.remoteId.replace(spec.key, id), parentRemoteId: f.parentRemoteId?.replace(spec.key, id) ?? null }));
    for (let i = 0; i < files.length; i += 200) {
      const chunk = files.slice(i, i + 200);
      const values = chunk.map((_, j) => `($1, $${j * 2 + 2}, $${j * 2 + 3})`).join(",");
      await query(`INSERT INTO demo_files (account_id, remote_id, data) VALUES ${values} ON CONFLICT DO NOTHING`, [id, ...chunk.flatMap((f) => [f.remoteId, JSON.stringify(f)])]);
    }
    ids.push(id);
  }
  await ensurePrimary();
  for (const id of ids) await refreshQuota(id);
  return ids;
}
