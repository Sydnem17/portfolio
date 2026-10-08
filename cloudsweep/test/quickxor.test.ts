import { describe, expect, it } from "vitest";
import { QuickXorHash } from "@/lib/quickxor";

/**
 * Line-by-line transcription of Microsoft's reference C# implementation (QuickXorHash.cs from the
 * OneDrive API docs), using BigInt for the three 64-bit cells. The fast byte-wise version must match it.
 */
function reference(data: Uint8Array): string {
  const BitsInLastCell = 32;
  const Shift = 11;
  const WidthInBits = 160;
  const cells = [0n, 0n, 0n];
  const mask = (1n << 64n) - 1n;
  let shiftSoFar = 0;
  let lengthSoFar = 0;
  const hashCore = (array: Uint8Array, ibStart: number, cbSize: number) => {
    const currentShift = shiftSoFar;
    let vectorArrayIndex = Math.floor(currentShift / 64);
    let vectorOffset = currentShift % 64;
    const iterations = Math.min(cbSize, WidthInBits);
    for (let i = 0; i < iterations; i++) {
      const isLastCell = vectorArrayIndex === cells.length - 1;
      const bitsInVectorCell = isLastCell ? BitsInLastCell : 64;
      if (vectorOffset <= bitsInVectorCell - 8) {
        for (let j = ibStart + i; j < cbSize + ibStart; j += WidthInBits)
          cells[vectorArrayIndex] = (cells[vectorArrayIndex] ^ (BigInt(array[j]) << BigInt(vectorOffset))) & mask;
      } else {
        const index1 = vectorArrayIndex;
        const index2 = isLastCell ? 0 : vectorArrayIndex + 1;
        const low = bitsInVectorCell - vectorOffset;
        let xoredByte = 0;
        for (let j = ibStart + i; j < cbSize + ibStart; j += WidthInBits) xoredByte ^= array[j];
        cells[index1] = (cells[index1] ^ (BigInt(xoredByte) << BigInt(vectorOffset))) & mask;
        cells[index2] = (cells[index2] ^ (BigInt(xoredByte) >> BigInt(low))) & mask;
      }
      vectorOffset += Shift;
      while (vectorOffset >= bitsInVectorCell) {
        vectorArrayIndex = isLastCell ? 0 : vectorArrayIndex + 1;
        vectorOffset -= bitsInVectorCell;
      }
    }
    shiftSoFar = (shiftSoFar + Shift * (cbSize % WidthInBits)) % WidthInBits;
    lengthSoFar += cbSize;
  };
  hashCore(data, 0, data.length);
  const rgb = new Uint8Array(20);
  for (let c = 0; c < 3; c++) {
    const bytes = c < 2 ? 8 : 4;
    for (let k = 0; k < bytes; k++) rgb[c * 8 + k] = Number((cells[c] >> BigInt(8 * k)) & 0xffn);
  }
  let len = BigInt(lengthSoFar);
  for (let i = 0; i < 8; i++) {
    rgb[12 + i] ^= Number(len & 0xffn);
    len >>= 8n;
  }
  return Buffer.from(rgb).toString("base64");
}

function random(n: number, seed: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    out[i] = seed >>> 24;
  }
  return out;
}

describe("QuickXorHash", () => {
  it("hashes an empty file to all zeros", () => {
    expect(new QuickXorHash().digest()).toBe("AAAAAAAAAAAAAAAAAAAAAAAAAAA=");
  });

  it.each([1, 7, 19, 20, 159, 160, 161, 1000, 65536 + 3])("matches the reference algorithm for %i bytes", (n) => {
    const data = random(n, n);
    expect(new QuickXorHash().update(data).digest()).toBe(reference(data));
  });

  it("gives the same result however the file is chunked", () => {
    const data = random(100_000, 42);
    const whole = new QuickXorHash().update(data).digest();
    const h = new QuickXorHash();
    for (let i = 0; i < data.length; i += 4093) h.update(data.subarray(i, i + 4093));
    expect(h.digest()).toBe(whole);
  });
});
