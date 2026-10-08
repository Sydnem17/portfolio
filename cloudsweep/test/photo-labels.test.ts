import { describe, expect, it } from "vitest";
import { toTags } from "@/lib/photo-labels";

const det = (...xs: Array<[string, number]>) => xs.map(([c, score]) => ({ class: c, score, bbox: [0, 0, 1, 1] }));
const pred = (...xs: Array<[string, number]>) => xs.map(([className, probability]) => ({ className, probability }));

describe("free browser AI → photo tags", () => {
  it("names the dog's breed and counts people", () => {
    const t = toTags(det(["person", 0.9], ["person", 0.8], ["dog", 0.92]), pred(["golden retriever", 0.71], ["Labrador retriever", 0.12]));
    expect(t.people_count).toBe(2);
    expect(t.pets).toEqual([{ species: "dog", description: "golden retriever" }]);
    expect(t.caption).toBe("2 people with a golden retriever");
  });

  it("finds a close-up cat the object detector missed", () => {
    const t = toTags([], pred(["tabby, tabby cat", 0.6]));
    expect(t.pets).toEqual([{ species: "cat", description: "tabby cat" }]);
    expect(t.caption).toBe("A tabby cat");
  });

  it("works out the scene and ignores weak guesses", () => {
    const beach = toTags(det(["person", 0.7]), pred(["seashore, coast, seacoast, sea-coast", 0.5]));
    expect(beach.scene).toBe("beach & coast");
    expect(beach.caption).toBe("A person at the beach");
    expect(toTags(det(["person", 0.3]), pred(["alp", 0.05])).scene).toBeNull();
    expect(toTags(det(["person", 0.3]), pred(["alp", 0.05])).people_count).toBe(0);
  });

  it("lists things and spots celebrations and weddings", () => {
    const party = toTags(det(["person", 0.9], ["person", 0.9], ["person", 0.9], ["cake", 0.8], ["cell phone", 0.6]), pred(["birthday card", 0.1]));
    expect(party.event).toBe("celebration");
    expect(party.things).toEqual(["cake", "phone"]);
    expect(party.scene).toBe("food & drink");
    expect(toTags(det(["person", 0.9], ["person", 0.9]), pred(["groom, bridegroom", 0.3])).event).toBe("wedding");
    expect(toTags(det(["person", 0.9]), pred(["gown", 0.5])).event).toBeNull();
  });

  it("files wild animals under their own type, not as pets", () => {
    const t = toTags(det(["elephant", 0.9]), pred(["African elephant, Loxodonta africana", 0.8]));
    expect(t.pets).toEqual([{ species: "wildlife", description: "african elephant" }]);
    expect(t.caption).toBe("An african elephant");
  });

  it("keeps wild animals out of Pets (the mix-ups from a real library)", () => {
    // Fox the detector called a cat, meerkat it called a dog, hippo it called a horse.
    const fox = toTags(det(["cat", 0.82]), pred(["red fox, Vulpes vulpes", 0.41], ["kit fox, Vulpes macrotis", 0.2]));
    expect(fox.pets).toEqual([{ species: "wildlife", description: "red fox" }]);
    expect(fox.scene).toBe("wildlife");
    expect(fox.caption).toBe("A red fox");
    expect(toTags(det(["dog", 0.7]), pred(["meerkat, mierkat", 0.55])).pets).toEqual([{ species: "wildlife", description: "meerkat" }]);
    expect(toTags(det(["horse", 0.9]), pred(["hippopotamus, hippo, river horse, Hippopotamus amphibius", 0.6])).pets).toEqual([{ species: "wildlife", description: "hippopotamus" }]);
    // A planet the detector thought was a bird, with nothing else agreeing.
    expect(toTags(det(["bird", 0.55]), pred(["planetarium", 0.2])).pets).toEqual([]);
  });

  it("only names a breed when the classifier is confident, otherwise just the species", () => {
    // Dachshunds aren't in the classifier's vocabulary, so its breed guesses are weak.
    const sausage = toTags(det(["dog", 0.93]), pred(["Doberman, Doberman pinscher", 0.18], ["black-and-tan coonhound", 0.16]));
    expect(sausage.pets).toEqual([{ species: "dog", description: "dog" }]);
    // A very sure detector still counts a pet even when the classifier says nothing useful.
    expect(toTags(det(["cat", 0.9]), pred(["window screen", 0.3])).pets).toEqual([{ species: "cat", description: "cat" }]);
    expect(toTags(det(["bird", 0.8]), pred(["sulphur-crested cockatoo, Kakatoe galerita, Cacatua galerita", 0.62])).pets).toEqual([{ species: "bird", description: "sulphur-crested cockatoo" }]);
  });
});

describe("telling graphics from photos", async () => {
  const { looksLikeGraphic, pixelStats } = await import("@/lib/photo-labels");
  const solid = (colours: number[][], n = 48 * 48) => {
    const a = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) a.set([...colours[i % colours.length], 255], i * 4);
    return a;
  };
  const noisy = () => {
    const a = new Uint8ClampedArray(48 * 48 * 4);
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) >> 16) & 255;
    for (let i = 0; i < a.length; i += 4) a.set([rnd(), rnd(), rnd(), 255], i);
    return a;
  };

  it("measures colour spread", () => {
    expect(pixelStats(solid([[0, 0, 0], [255, 255, 255]]))).toEqual({ top4: 1, distinct: 2 });
    expect(pixelStats(noisy()).distinct).toBeGreaterThan(200);
  });

  it("flags logos, screenshots and documents; keeps real photos", () => {
    const flat = pixelStats(solid([[0, 0, 0], [30, 215, 96], [255, 255, 255]]));
    const photo = pixelStats(noisy());
    expect(looksLikeGraphic({ name: "spotify.jpg" }, flat)).toBe(true);
    expect(looksLikeGraphic({ name: "Screenshot_20240316-101500.png" }, photo)).toBe(true);
    expect(looksLikeGraphic({ name: "Harlem Hustle logo final.jpg" }, photo)).toBe(true);
    expect(looksLikeGraphic({ name: "IMG_2041.jpg" }, photo)).toBe(false);
    expect(looksLikeGraphic({ name: "IMG_2041.jpg" }, { top4: 0.5, distinct: 168 })).toBe(false); // beach with a big grey sky
    expect(looksLikeGraphic({ name: "IMG_2041.jpg" }, flat)).toBe(true); // a photo of a blank screen
    expect(looksLikeGraphic({ name: "holiday.png", mime: "image/png" }, photo)).toBe(false); // a real photo saved as PNG
    expect(looksLikeGraphic({ name: "artwork.png", mime: "image/png" }, { top4: 0.6, distinct: 120 })).toBe(true);
  });
});
