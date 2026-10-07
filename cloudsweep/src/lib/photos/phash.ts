/** 64-bit difference hash (dHash): robust to resizing, recompression and small colour shifts. */
export async function dHash(image: Buffer): Promise<string | null> {
  try {
    const sharp = (await import("sharp")).default;
    const px = await sharp(image).rotate().greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
    let bits = "";
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += px[y * 9 + x] > px[y * 9 + x + 1] ? "1" : "0";
    let hex = "";
    for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    return hex;
  } catch {
    return null;
  }
}

/** Normalise any thumbnail to a small JPEG for vision analysis. */
export async function toJpeg(image: Buffer, max = 512): Promise<Buffer | null> {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(image).rotate().resize(max, max, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
  } catch {
    return null;
  }
}
