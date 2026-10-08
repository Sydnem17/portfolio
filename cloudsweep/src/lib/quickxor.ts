/**
 * Microsoft's QuickXorHash: the fingerprint OneDrive (personal and work/school) reports for every file.
 * Computing it locally lets files on this computer match OneDrive files exactly.
 *
 * The algorithm XORs each byte into a 160-bit circular register, advancing 11 bits per byte,
 * then XORs the file length (little-endian, 8 bytes) into the last 8 bytes. Output is base64.
 */
export class QuickXorHash {
  private reg = new Uint8Array(20);
  private bit = 0; // bit offset in the 160-bit register for the next byte
  private length = 0;

  update(chunk: Uint8Array): this {
    const reg = this.reg;
    let bit = this.bit;
    for (let i = 0; i < chunk.length; i++) {
      const b = chunk[i];
      const byteIdx = bit >> 3;
      const shift = bit & 7;
      reg[byteIdx] ^= (b << shift) & 0xff;
      if (shift) reg[byteIdx === 19 ? 0 : byteIdx + 1] ^= b >> (8 - shift);
      bit += 11;
      if (bit >= 160) bit -= 160;
    }
    this.bit = bit;
    this.length += chunk.length;
    return this;
  }

  digest(): string {
    const out = this.reg.slice();
    let len = this.length;
    for (let i = 0; i < 8; i++) {
      out[12 + i] ^= len % 256;
      len = Math.floor(len / 256);
    }
    let bin = "";
    for (const b of out) bin += String.fromCharCode(b);
    return btoa(bin);
  }
}
