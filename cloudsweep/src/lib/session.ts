/** Session cookies signed with HMAC-SHA256 via Web Crypto, so they verify in Edge middleware too. */
export const SESSION_COOKIE = "cs_session";
const MAX_AGE_DAYS = 30;

async function hmac(value: string): Promise<string> {
  const secret = process.env.APP_SECRET ?? "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`session:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createSession(): Promise<{ value: string; maxAge: number }> {
  const maxAge = MAX_AGE_DAYS * 86400;
  const exp = String(Date.now() + maxAge * 1000);
  return { value: `${exp}.${await hmac(exp)}`, maxAge };
}

export async function isValidSession(value: string | undefined): Promise<boolean> {
  if (!value || !process.env.APP_SECRET) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const expected = await hmac(exp);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
