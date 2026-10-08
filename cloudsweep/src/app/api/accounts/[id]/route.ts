import { z } from "zod";
import { removeAccount, renameAccount, setPrimary } from "@/lib/accounts";
import { handler } from "@/lib/api";

const Patch = z.object({ label: z.string().min(1).max(80).optional(), primary: z.literal(true).optional() });

export const PATCH = handler(async (req: Request, { params }: { params: { id: string } }) => {
  const body = Patch.parse(await req.json());
  if (body.label) await renameAccount(params.id, body.label);
  if (body.primary) await setPrimary(params.id);
  return { ok: true };
});

/** Disconnects the account and forgets its index. Nothing is deleted in the cloud. */
export const DELETE = handler(async (_req: Request, { params }: { params: { id: string } }) => {
  await removeAccount(params.id);
  return { ok: true };
});

export const dynamic = "force-dynamic";
