import { describe, expect, it } from "vitest";
import { buildRenames, DEFAULT_OPTIONS, formatDate, isMessyName, nameProblem, suggest, tidyName, type RenameFile } from "@/lib/rename";

const f = (name: string, extra: Partial<RenameFile> = {}): RenameFile => ({ id: name, dirKey: "a|/Photos", name, kind: "image", date: null, place: null, folder: "Photos", ...extra });
const opts = (o: Partial<typeof DEFAULT_OPTIONS>) => ({ ...DEFAULT_OPTIONS, ...o });

describe("bulk rename rules", () => {
  it("formats dates day-first or ISO, never month-first, without time-zone shifts", () => {
    expect(formatDate("2024-03-16T23:30:00Z", "iso")).toBe("2024-03-16");
    expect(formatDate("2024-03-16T23:30:00Z", "dmy")).toBe("16-03-2024");
    expect(formatDate("2024-03-06T00:00:00Z", "long")).toBe("6 Mar 2024");
    expect(formatDate(null, "iso")).toBe("");
  });

  it("names photos by date and place, numbered in date order", () => {
    const files = [
      f("IMG_2.JPG", { date: "2024-03-16T10:00:00Z", place: "Bondi, Sydney" }),
      f("IMG_1.JPG", { date: "2024-03-16T09:00:00Z", place: "Bondi, Sydney" }),
      f("IMG_3.jpg", { date: "2024-03-17T09:00:00Z", place: null }),
    ];
    const r = buildRenames(files, opts({ pattern: "{date} {place} {n}" }));
    expect(r.map((x) => x.to)).toEqual(["2024-03-16 Bondi 02.jpg", "2024-03-16 Bondi 01.jpg", "2024-03-17 01.jpg"]);
    expect(r.every((x) => x.changed)).toBe(true);
  });

  it("never clashes with other files in the folder or within the batch", () => {
    const files = [f("a.jpg", { date: "2024-01-01" }), f("b.jpg", { date: "2024-01-01" })];
    const r = buildRenames(files, opts({ pattern: "{date}" }), { "a|/Photos": ["2024-01-01.jpg"] });
    expect(r.map((x) => x.to)).toEqual(["2024-01-01 (2).jpg", "2024-01-01 (3).jpg"]);
    expect(r[0].note).toMatch(/clash/);
  });

  it("does not take a name another selected file still holds", () => {
    const files = [f("x.jpg", { id: "1" }), f("y.jpg", { id: "2" })];
    const r = buildRenames(files, opts({ mode: "replace", find: "x", replace: "y" }));
    expect(r[0].to).toBe("y (2).jpg");
    expect(r[1].changed).toBe(false);
  });

  it("keeps the extension and tidies messy names", () => {
    expect(tidyName("Copy of my_holiday_photo (1)")).toBe("my holiday photo");
    const r = buildRenames([f("Scan_0001 - Copy.PDF", { kind: "document" })], opts({ pattern: "{name}" }));
    expect(r[0].to).toBe("Scan 0001.pdf");
  });

  it("find and replace is literal and case-insensitive by default", () => {
    const r = buildRenames([f("Invoice (draft) v2.docx", { kind: "document" })], opts({ mode: "replace", find: "(DRAFT) ", replace: "", tidy: false }));
    expect(r[0].to).toBe("Invoice v2.docx");
  });

  it("strips characters that clouds and Windows reject", () => {
    const r = buildRenames([f("a.txt", { folder: 'Q1: "Plans"', kind: "document" })], opts({ pattern: "{folder} {name}" }));
    expect(r[0].to).toBe("Q1 Plans a.txt");
    expect(nameProblem("bad/name")).toBeTruthy();
    expect(nameProblem("ends.")).toBeTruthy();
    expect(nameProblem("CON.txt")).toBeTruthy();
    expect(nameProblem("Fine name.jpg")).toBeNull();
  });

  it("falls back to the current name when a pattern produces nothing", () => {
    const r = buildRenames([f("Holiday.jpg")], opts({ pattern: "{place}" }));
    expect(r[0].to).toBe("Holiday.jpg");
    expect(r[0].changed).toBe(false);
  });

  it("spots messy names and suggests patterns that fit the selection", () => {
    expect(isMessyName("IMG_1234.jpg")).toBe(true);
    expect(isMessyName("PXL_20240316_093000.jpg")).toBe(true);
    expect(isMessyName("Scan0001.pdf")).toBe(true);
    expect(isMessyName("Fiji sunset.jpg")).toBe(false);
    // Camera names get date patterns, not "tidy"; generic folders ("Photos", "2022") aren't suggested.
    const photos = [f("IMG_1.jpg", { place: "Suva" }), f("IMG_2.jpg", { place: "Suva" })];
    expect(suggest(photos).map((s) => s.id)).toEqual(["date-place", "date"]);
    const album = [f("my_trip (1).jpg", { folder: "Fiji Holiday" }), f("IMG_2.jpg", { folder: "2022" })];
    expect(suggest(album).map((s) => s.id)).toEqual(["date", "folder-date", "tidy"]);
    expect(suggest([f("Copy of report.docx", { kind: "document" })])[0].id).toBe("tidy");
    expect(suggest([f("Scan0001.pdf", { kind: "document" })]).map((s) => s.id)).toEqual(["date-name"]);
  });
});
