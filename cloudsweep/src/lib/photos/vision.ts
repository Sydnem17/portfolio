import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * Photo understanding with Claude: pets, scenes, things, events, place hints and a caption.
 *
 * Privacy by design: the prompt asks only for the NUMBER of people, never who they are.
 * Recognising specific people is a separate, opt-in face-clustering step (see README → Roadmap).
 */
export const PhotoTags = z.object({
  index: z.number().int(),
  people_count: z.number().int(),
  pets: z.array(z.object({ species: z.string(), description: z.string() })),
  things: z.array(z.string()),
  scene: z.string(),
  event: z.string().nullable(),
  place_hint: z.string().nullable(),
  caption: z.string(),
});
export type PhotoTags = z.infer<typeof PhotoTags>;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["photos"],
  properties: {
    photos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "people_count", "pets", "things", "scene", "event", "place_hint", "caption"],
        properties: {
          index: { type: "integer" },
          people_count: { type: "integer" },
          pets: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["species", "description"],
              properties: { species: { type: "string" }, description: { type: "string" } },
            },
          },
          things: { type: "array", items: { type: "string" } },
          scene: { type: "string" },
          event: { type: ["string", "null"] },
          place_hint: { type: ["string", "null"] },
          caption: { type: "string" },
        },
      },
    },
  },
} as const;

const SYSTEM = `You catalogue personal photo libraries so people can browse them by pets, places, scenes and events.
For each numbered photo return:
- people_count: how many people are visible (0 if none). Never guess identities, names, ages, ethnicity or other personal attributes.
- pets: each animal that looks like a pet or companion animal, with species ("dog", "cat", "horse", "bird"...) and a short visual description including breed or colouring when clear (e.g. "golden retriever", "grey tabby").
- things: up to 6 notable objects, lowercase nouns.
- scene: one or two lowercase words for the setting (beach, park, kitchen, office, street, mountains, restaurant...).
- event: a recognisable occasion if obvious (birthday, wedding, graduation, christmas, holiday, sport), else null.
- place_hint: a landmark or city only when it is clearly identifiable from the image itself (signage, famous landmark), else null.
- caption: one plain sentence under 15 words.
Screenshots, documents and receipts are fine to describe; use scene "document" or "screenshot".`;

export function visionEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;

export async function tagPhotos(jpegs: Buffer[]): Promise<PhotoTags[]> {
  client ??= new Anthropic();
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  jpegs.forEach((img, i) => {
    content.push({ type: "text", text: `Photo ${i}:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: img.toString("base64") } });
  });
  content.push({ type: "text", text: `Catalogue all ${jpegs.length} photos. Use each photo's number as its index.` });

  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 8000,
    system: SYSTEM,
    // Routine classification: low effort keeps cost and latency down.
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") return [];
  const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text;
  if (!text) return [];
  const parsed = z.object({ photos: z.array(PhotoTags) }).safeParse(JSON.parse(text));
  return parsed.success ? parsed.data.photos : [];
}
