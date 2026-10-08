import { handler } from "@/lib/api";
import { localHashCandidates } from "@/lib/local";

export const GET = handler(async (_req: Request, { params }: { params: { id: string } }) => localHashCandidates(params.id));

export const dynamic = "force-dynamic";
