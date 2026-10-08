import { z } from "zod";

export const ConsolidateBody = z.object({
  sourceAccountIds: z.array(z.string()).min(1),
  targetAccountId: z.string(),
  targetFolder: z.string().min(1).max(200),
  mode: z.enum(["copy", "move"]),
  kinds: z.array(z.string()).optional(),
  pathPrefix: z.string().max(400).optional(),
  keepStructure: z.boolean().optional(),
  skipDuplicates: z.boolean().optional(),
});
