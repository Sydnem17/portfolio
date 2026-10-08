import { describe, expect, it } from "vitest";
import { chooseKeeper, findDuplicates, findFolderOverlaps, hamming, normaliseName, type FileRow } from "@/lib/dedupe";

let n = 0;
const f = (p: Partial<FileRow>): FileRow => ({
  id: `f${++n}`,
  accountId: "a",
  accountLabel: "A",
  provider: "google",
  isPrimary: false,
  name: "x.jpg",
  path: "/x.jpg",
  size: 100,
  kind: "image",
  ...p,
});

describe("normaliseName", () => {
  it("strips copy markers", () => {
    expect(normaliseName("Copy of Budget.xlsx")).toBe("budget.xlsx");
    expect(normaliseName("IMG_1234 (1).JPEG")).toBe("img_1234.jpg");
    expect(normaliseName("Report - Copy.pdf")).toBe("report.pdf");
  });
});

describe("findDuplicates", () => {
  it("groups exact matches by shared hash and size", () => {
    const g = findDuplicates([f({ md5: "aa", path: "/a/x.jpg" }), f({ md5: "aa", path: "/b/x.jpg", accountId: "b" }), f({ md5: "bb" })]);
    expect(g).toHaveLength(1);
    expect(g[0].confidence).toBe("exact");
    expect(g[0].crossAccount).toBe(true);
    expect(g[0].wasteBytes).toBe(100);
  });

  it("matches across providers through any common hash type", () => {
    const g = findDuplicates([f({ md5: "m", sha256: "S" }), f({ quickXor: "q", sha256: "s" })]);
    expect(g[0]?.confidence).toBe("exact");
  });

  it("never groups files whose comparable hashes differ, even with the same name", () => {
    expect(findDuplicates([f({ name: "a.pdf", md5: "1" }), f({ name: "a.pdf", md5: "2" })])).toHaveLength(0);
  });

  it("flags same-size same-name files without comparable hashes as likely", () => {
    const g = findDuplicates([f({ name: "Deck.pptx", md5: "1" }), f({ name: "Copy of Deck.pptx", quickXor: "q" })]);
    expect(g[0].confidence).toBe("likely");
  });

  it("promotes likely to exact once content hashes are verified", () => {
    const g = findDuplicates([f({ name: "Deck.pptx", md5: "1", contentSha256: "c" }), f({ name: "Deck.pptx", quickXor: "q", contentSha256: "c" })]);
    expect(g[0].confidence).toBe("exact");
  });

  it("finds visually similar photos of different sizes", () => {
    const g = findDuplicates([f({ size: 5000, phash: "ffff0000ffff0000", width: 4000, height: 3000 }), f({ size: 900, phash: "ffff0000ffff0001", width: 800, height: 600 })]);
    expect(g[0].confidence).toBe("similar");
    expect(g[0].members[0].size).toBe(5000); // keeps highest resolution
  });

  it("ignores empty files", () => {
    expect(findDuplicates([f({ size: 0, md5: "z" }), f({ size: 0, md5: "z" })])).toHaveLength(0);
  });
});

describe("chooseKeeper", () => {
  it("prefers the primary account, original names and organised folders", () => {
    const a = f({ name: "Copy of tax.pdf", path: "/Downloads/Copy of tax.pdf" });
    const b = f({ name: "tax.pdf", path: "/Documents/Tax/tax.pdf", isPrimary: true });
    expect(chooseKeeper([a, b], "exact").keeperId).toBe(b.id);
  });
});

describe("hamming", () => {
  it("counts differing bits", () => {
    expect(hamming("0000000000000000", "0000000000000003")).toBe(2);
    expect(hamming("ffffffffffffffff", "0000000000000000")).toBe(64);
  });
});

describe("findFolderOverlaps", () => {
  it("reports a folder fully contained in another", () => {
    const files = [1, 2, 3].flatMap((i) => [
      f({ md5: `h${i}`, size: 100 + i, path: `/Backup/Trip/p${i}.jpg`, accountId: "b", accountLabel: "B" }),
      f({ md5: `h${i}`, size: 100 + i, path: `/Photos/Trip/p${i}.jpg` }),
    ]);
    files.push(f({ md5: "h9", size: 999, path: "/Photos/Trip/extra.jpg" }));
    const o = findFolderOverlaps(files, findDuplicates(files));
    expect(o).toHaveLength(1);
    expect(o[0].folder.path).toBe("/Backup/Trip");
    expect(o[0].overlap).toBe(1);
  });
});
