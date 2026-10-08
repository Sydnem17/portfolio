import "server-only";
import { query } from "./db";

export interface SetupIssue {
  key: string;
  problem: string;
  fix: string;
}

const HOSTED = Boolean(process.env.VERCEL || process.env.NETLIFY);

/**
 * Plain-English checks for settings that would otherwise surface as a generic
 * "Something went wrong" (production builds hide server error messages).
 */
export async function setupIssues(): Promise<SetupIssue[]> {
  const issues: SetupIssue[] = [];
  if (!process.env.APP_SECRET || process.env.APP_SECRET.length < 32)
    issues.push({ key: "APP_SECRET", problem: "is missing or shorter than 32 characters.", fix: "Add 48 random letters and numbers. Keep a copy — changing it later means reconnecting your drives." });
  if (HOSTED && !process.env.DATABASE_URL)
    issues.push({ key: "DATABASE_URL", problem: "is not set, so CloudSweep has nowhere to store its index.", fix: "In Vercel: Storage → Create Database → Neon → Connect. If the variable it adds has a different name (e.g. POSTGRES_URL), copy its value into a new DATABASE_URL." });
  if (!process.env.APP_URL)
    issues.push({ key: "APP_URL", problem: "is not set.", fix: "Set it to your site address, e.g. https://your-project.vercel.app (no trailing slash). Sign-in to Google/Microsoft needs it." });
  if (issues.some((i) => i.key === "DATABASE_URL" || i.key === "APP_SECRET")) return issues;
  try {
    await query("SELECT 1");
  } catch (err) {
    issues.push({
      key: "DATABASE_URL",
      problem: `is set, but the database can't be reached (${(err as Error).message.replace(/postgres(ql)?:\/\/\S+/g, "[connection string]").slice(0, 160)}).`,
      fix: "Copy the connection string again from your database provider (it should start with postgresql:// and end with ?sslmode=require), update DATABASE_URL and redeploy.",
    });
  }
  return issues;
}
