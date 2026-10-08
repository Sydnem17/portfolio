import "server-only";
import { z } from "zod";
import { TAGGER_VERSION } from "../photo-labels";
import { num, one, query } from "../db";

/** Bump when the browser tagging rules improve: photos tagged by an older version are looked at again. */
export const BROWSER_TAGGER = TAGGER_VERSION;
/** Photos with no AI tags yet, or tags from an older version of the free browser AI. */
export const NEEDS_BROWSER_TAGS = `(t.item_id IS NULL OR t.tagged_by IS NULL OR (t.tagged_by LIKE 'browser%' AND t.tagged_by <> '${BROWSER_TAGGER}'))`;

// Demo photos come pre-tagged; files on this computer have no thumbnails to look at.
const UNTAGGED = `FROM items i JOIN accounts a ON a.id = i.account_id LEFT JOIN photo_tags t ON t.item_id = i.id
  WHERE i.kind = 'image' AND NOT i.trashed AND a.provider NOT IN ('demo', 'local') AND ${NEEDS_BROWSER_TAGS}`;

export async function untaggedPhotos(limit: number) {
  const rows = await query<{ id: string; name: string; mime: string | null }>(`SELECT i.id, i.name, i.mime ${UNTAGGED} ORDER BY i.taken_at DESC NULLS LAST, i.id LIMIT $1`, [limit]);
  const remaining = num((await one(`SELECT COUNT(*) AS n ${UNTAGGED}`))?.n);
  return { ids: rows.map((r) => r.id), items: rows, remaining };
}

const text = z.string().trim().min(1).max(80);
export const BrowserTagsBody = z.object({
  tagger: z.string().optional(),
  tags: z
    .array(
      z.union([
        z.object({ id: z.string(), failed: z.literal(true) }),
        z.object({
          id: z.string(),
          people_count: z.number().int().min(0).max(500),
          pets: z.array(z.object({ species: text, description: text })).max(6),
          things: z.array(text).max(12),
          scene: text.nullable(),
          event: text.nullable(),
          caption: z.string().max(300),
        }),
      ]),
    )
    .max(100),
});

/** Stores the browser AI's tags. Never replaces tags from Claude, which are more detailed. */
export async function saveBrowserTags(tags: z.infer<typeof BrowserTagsBody>["tags"]) {
  let saved = 0;
  for (const t of tags) {
    const exists = await one<{ id: string }>("SELECT id FROM items WHERE id = $1 AND kind = 'image'", [t.id]);
    if (!exists) continue;
    if ("failed" in t) {
      await query(
        `INSERT INTO photo_tags (item_id, tagged_by) VALUES ($1, '${BROWSER_TAGGER}')
         ON CONFLICT (item_id) DO UPDATE SET tagged_by = EXCLUDED.tagged_by WHERE photo_tags.tagged_by IS NULL OR photo_tags.tagged_by LIKE 'browser%'`,
        [t.id],
      );
      continue;
    }
    await query(
      `INSERT INTO photo_tags (item_id, people_count, pets, things, scene, event, place_hint, caption, tagged_by) VALUES ($1,$2,$3,$4,$5,$6,NULL,$7,'${BROWSER_TAGGER}')
       ON CONFLICT (item_id) DO UPDATE SET people_count = EXCLUDED.people_count, pets = EXCLUDED.pets, things = EXCLUDED.things, scene = EXCLUDED.scene,
         event = EXCLUDED.event, caption = EXCLUDED.caption, tagged_by = EXCLUDED.tagged_by, analysed_at = now()
       WHERE photo_tags.tagged_by IS DISTINCT FROM 'claude' AND photo_tags.tagged_by IS DISTINCT FROM 'demo'`,
      [t.id, t.people_count, JSON.stringify(t.pets), JSON.stringify(t.things), t.scene, t.event, t.caption],
    );
    saved++;
  }
  return { saved };
}
