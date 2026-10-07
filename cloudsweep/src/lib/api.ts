import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** Wraps a route handler with consistent JSON errors. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response | object>) {
  return async (...args: A): Promise<Response> => {
    try {
      const out = await fn(...args);
      return out instanceof Response ? out : NextResponse.json(out);
    } catch (err) {
      if (err instanceof ZodError) return NextResponse.json({ error: "Invalid request", issues: err.issues }, { status: 400 });
      console.error(err);
      return NextResponse.json({ error: (err as Error).message }, { status: 500 });
    }
  };
}

export function appUrl(req: Request): string {
  return (process.env.APP_URL ?? new URL(req.url).origin).replace(/\/$/, "");
}
