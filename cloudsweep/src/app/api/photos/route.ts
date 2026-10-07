import { handler } from "@/lib/api";
import { photoCollections } from "@/lib/photos/groups";

export const GET = handler(async () => photoCollections());

export const dynamic = "force-dynamic";
