import { handler } from "@/lib/api";
import { recheckLocations } from "@/lib/photos/exif-queue";

/** Queues every photo without a location to have its GPS read again (e.g. after earlier failures). */
export const POST = handler(async () => recheckLocations());

export const dynamic = "force-dynamic";
