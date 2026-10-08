import "server-only";
import { query } from "../db";
import { createJob } from "../jobs";

export async function recheckLocations() {
  const rows = await query<{ id: string }>(
    `UPDATE items i SET exif_checked = FALSE FROM accounts a
     WHERE a.id = i.account_id AND i.kind = 'image' AND NOT i.trashed AND i.lat IS NULL AND i.exif_checked AND a.provider NOT IN ('local', 'demo')
     RETURNING i.id`,
  );
  const job = rows.length ? await createJob("analyse", null) : null;
  return { queued: rows.length, job };
}
