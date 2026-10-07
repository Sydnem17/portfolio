import "server-only";
import { SCHEMA } from "./schema";

/**
 * Database access.
 *
 * Production: any hosted Postgres via DATABASE_URL (Neon, Supabase, Vercel Postgres).
 * Local dev:  embedded Postgres (PGlite, WASM) persisted to ./.data — no install needed.
 * Both speak the same SQL with $1-style parameters.
 */
type Row = Record<string, any>;
interface Driver {
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]>;
  exec(text: string): Promise<void>;
}

let driverPromise: Promise<Driver> | null = null;

async function createDriver(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const postgres = (await import("postgres")).default;
    const sql = postgres(url, { max: 5, idle_timeout: 20, prepare: false });
    return {
      query: async (text, params = []) => (await sql.unsafe(text, params as any[])) as any,
      exec: async (text) => {
        await sql.unsafe(text);
      },
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR ?? (process.env.NODE_ENV === "test" ? undefined : "./.data/pglite");
  if (dir) (await import("node:fs")).mkdirSync(dir, { recursive: true });
  const db = dir ? new PGlite(dir) : new PGlite();
  await db.waitReady;
  return {
    query: async (text, params = []) => (await db.query(text, params as any[])).rows as any,
    exec: async (text) => {
      await db.exec(text);
    },
  };
}

async function getDriver(): Promise<Driver> {
  // Survive Next.js dev hot reloads with a single connection.
  const g = globalThis as any;
  if (g.__cloudsweepDb) return g.__cloudsweepDb;
  if (!driverPromise) {
    driverPromise = (async () => {
      const d = await createDriver();
      await d.exec(SCHEMA);
      return d;
    })().catch((err) => {
      driverPromise = null; // let the next request retry instead of caching the failure
      throw err;
    });
  }
  g.__cloudsweepDb = await driverPromise;
  return g.__cloudsweepDb;
}

export async function query<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]> {
  return (await getDriver()).query<T>(text, params);
}

export async function one<T extends Row = Row>(text: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Bigint columns come back as strings from some drivers; normalise to number. */
export function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : Number(v);
}
