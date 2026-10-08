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

  it("does not invent pets from wild animals", () => {
    const t = toTags(det(["elephant", 0.9]), pred(["African elephant, Loxodonta africana", 0.8]));
    expect(t.pets).toEqual([]);
    expect(t.things).toContain("elephant");
  });
});
