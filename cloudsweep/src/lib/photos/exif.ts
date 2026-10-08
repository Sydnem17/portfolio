import "server-only";
import exifr from "exifr";

/** Most phones and cameras put GPS in the first few KB; HEIC can need a little more. */
export const EXIF_HEAD_BYTES = 192 * 1024;

export interface ExifFacts {
  lat: number | null;
  lng: number | null;
  takenAt: string | null;
}

/**
 * Reads GPS and the capture time from the start of a photo (JPEG, HEIC, TIFF/RAW). Returns nulls
 * rather than throwing when the file has no EXIF or the head is too short.
 */
export async function readExifHead(head: Buffer): Promise<ExifFacts> {
  try {
    const [gps, data] = await Promise.all([exifr.gps(head).catch(() => null), exifr.parse(head, ["DateTimeOriginal", "CreateDate"]).catch(() => null)]);
    const lat = typeof gps?.latitude === "number" && Number.isFinite(gps.latitude) ? gps.latitude : null;
    const lng = typeof gps?.longitude === "number" && Number.isFinite(gps.longitude) ? gps.longitude : null;
    // (0, 0) is a common "no fix" placeholder, not a place in the ocean off Africa.
    const real = lat != null && lng != null && !(Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    const when = data?.DateTimeOriginal ?? data?.CreateDate;
    return { lat: real ? lat : null, lng: real ? lng : null, takenAt: when instanceof Date && !Number.isNaN(when.getTime()) ? when.toISOString() : null };
  } catch {
    return { lat: null, lng: null, takenAt: null };
  }
}
