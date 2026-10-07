import { handler } from "@/lib/api";
import { query } from "@/lib/db";

export const GET = handler(async () => ({
  actions: await query("SELECT a.*, acc.label AS account_label FROM actions a LEFT JOIN accounts acc ON acc.id = a.account_id ORDER BY a.id DESC LIMIT 300"),
}));

export const dynamic = "force-dynamic";
