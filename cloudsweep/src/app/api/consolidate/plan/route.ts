import { handler } from "@/lib/api";
import { buildPlan } from "@/lib/consolidate";
import { ConsolidateBody } from "../schema";

export const POST = handler(async (req: Request) => {
  const plan = await buildPlan(ConsolidateBody.parse(await req.json()));
  return { ...plan, rows: plan.rows.slice(0, 200), totalRows: plan.rows.length };
});

export const dynamic = "force-dynamic";
