/**
 * Turns the free, in-browser AI's raw output into CloudSweep photo tags (pets, people, scenes,
 * things, events, caption). Two models run on each thumbnail:
 *   - COCO-SSD finds objects: people, dogs, cats, birds, cakes, cars…
 *   - MobileNet names the picture as a whole: dog and cat breeds, beaches, mountains, food…
 * Pure functions, so the rules are testable without the models.
 */
import { IMAGENET_CLASSES } from "@tensorflow-models/mobilenet/dist/imagenet_classes";

export interface Detection {
  class: string;
  score: number;
}
export interface Prediction {
  className: string;
  probability: number;
}
export interface BrowserTags {
  people_count: number;
  pets: Array<{ species: string; description: string }>;
  things: string[];
  scene: string | null;
  event: string | null;
  caption: string;
}

const INDEX = new Map(Object.entries(IMAGENET_CLASSES as Record<string, string>).map(([i, name]) => [name, Number(i)]));
const short = (className: string) => className.split(",")[0].trim();

/** ImageNet classes that are pets, by species. */
function petSpecies(className: string): string | null {
  const i = INDEX.get(className);
  if (i == null) return null;
  if (i >= 151 && i <= 268) return "dog";
  if (i >= 281 && i <= 285) return "cat";
  if (i === 332 || i === 330) return "rabbit";
  if (i === 333) return "hamster";
  if (i === 338) return "guinea pig";
  if (i === 1) return "fish";
  if (i === 339) return "horse";
  if ((i >= 87 && i <= 90) || i === 7 || i === 8) return "bird"; // parrots, cockatoos, lorikeets, chickens
  return null;
}

/** ImageNet's first 398 classes are animals; the ones that aren't pets are wildlife (fox, meerkat, hippo…). */
function wildAnimal(className: string): string | null {
  const i = INDEX.get(className);
  return i != null && i <= 397 && !petSpecies(className) ? short(className).toLowerCase() : null;
}

/** Below this, the classifier is guessing (it doesn't know every breed, e.g. dachshunds), so say just "dog". */
const BREED_CONFIDENCE = 0.35;

const CAT_NAMES: Record<string, string> = { tabby: "tabby cat", "tiger cat": "tiger-striped cat", Persian: "Persian cat", Siamese: "Siamese cat", "Egyptian cat": "Egyptian cat" };
const breedName = (className: string) => {
  const n = short(className);
  return CAT_NAMES[n] ?? n.replace(/_/g, " ");
};

const COCO_PETS: Record<string, string> = { dog: "dog", cat: "cat", bird: "bird", horse: "horse" };

/** Whole-picture labels (MobileNet) that tell us the scene. */
const SCENES: Array<[string, string[]]> = [
  ["beach & coast", ["seashore", "sandbar", "promontory", "breakwater", "beacon", "catamaran"]],
  ["lakes & rivers", ["lakeside", "boathouse", "dock", "canoe", "paddle", "dam"]],
  ["mountains", ["alp", "valley", "volcano", "cliff", "mountain tent", "geyser"]],
  ["underwater", ["coral reef", "scuba diver", "snorkel", "brain coral"]],
  ["snow", ["ski", "snowmobile", "dogsled", "bobsled", "snowplow"]],
  ["landmarks & buildings", ["palace", "church", "monastery", "mosque", "castle", "triumphal arch", "obelisk", "stupa", "bell cote", "dome", "planetarium", "suspension bridge", "steel arch bridge", "pier", "library"]],
  ["food & drink", ["restaurant", "plate", "coffee mug", "cup", "teapot", "coffeepot", "cocktail shaker", "cheeseburger", "ice cream", "espresso", "hotdog", "bagel", "burrito", "carbonara", "guacamole", "potpie", "trifle", "meat loaf", "French loaf", "pretzel", "consomme", "hot pot", "eggnog", "red wine", "wine bottle", "beer glass", "pizza", "dining table", "menu", "bakery", "pomegranate", "strawberry", "mashed potato", "head cabbage", "broccoli"]],
  ["concerts & shows", ["stage", "theater curtain", "electric guitar", "microphone", "acoustic guitar", "drum", "spotlight"]],
  ["sport", ["basketball", "soccer ball", "volleyball", "rugby ball", "tennis ball", "racket", "golf ball", "ballplayer", "scoreboard", "football helmet", "golfcart", "balance beam", "parallel bars"]],
  ["gardens & parks", ["park bench", "lawn mower", "picket fence", "patio", "greenhouse", "pot", "daisy", "yellow lady's slipper", "hay"]],
  ["city & streets", ["streetcar", "cab", "trolleybus", "traffic light", "street sign", "parking meter", "police van", "minibus", "school bus", "passenger car"]],
  ["screenshots & documents", ["web site", "menu", "envelope", "book jacket", "comic book", "crossword puzzle", "monitor", "screen", "notebook", "desktop computer"]],
];
const SCENE_BY_NAME = new Map(SCENES.flatMap(([scene, names]) => names.map((n) => [n.toLowerCase(), scene] as const)));

/** Objects (COCO-SSD) that hint at a scene when nothing better is known. */
const COCO_SCENES: Record<string, string> = {
  pizza: "food & drink", cake: "food & drink", cup: "food & drink", bowl: "food & drink", banana: "food & drink", apple: "food & drink", orange: "food & drink", broccoli: "food & drink", carrot: "food & drink", sandwich: "food & drink", donut: "food & drink", "hot dog": "food & drink", "wine glass": "food & drink",
  surfboard: "beach & coast", boat: "lakes & rivers", skis: "snow", snowboard: "snow",
  "sports ball": "sport", "tennis racket": "sport", "baseball bat": "sport", skateboard: "sport",
  couch: "at home", bed: "at home", tv: "at home", "potted plant": "at home",
  car: "city & streets", bus: "city & streets", "traffic light": "city & streets", truck: "city & streets",
};

const FRIENDLY_THING: Record<string, string> = { "cell phone": "phone", tv: "TV", "dining table": "table", "potted plant": "plant", "sports ball": "ball", "wine glass": "wine" };
const IGNORE_THINGS = new Set(["person", "chair", "dining table"]);

export function toTags(detections: Detection[], predictions: Prediction[]): BrowserTags {
  const seen = detections.filter((d) => d.score >= 0.5);
  const people = seen.filter((d) => d.class === "person").length;

  // Pets: the object detector sees "an animal shaped like a dog/cat/bird/horse", but it labels foxes as
  // cats, meerkats as dogs and hippos as horses. So the whole-picture classifier must agree: it either
  // names a pet of that species, or at least doesn't name a wild animal and the detector is very sure.
  const pets: BrowserTags["pets"] = [];
  const top = predictions.filter((p) => p.probability >= 0.12);
  const wild = predictions.filter((p) => p.probability >= 0.15).map((p) => wildAnimal(p.className)).filter(Boolean) as string[];
  for (const species of new Set(seen.map((d) => COCO_PETS[d.class]).filter(Boolean))) {
    const match = top.find((p) => petSpecies(p.className) === species);
    const bestScore = Math.max(...seen.filter((d) => COCO_PETS[d.class] === species).map((d) => d.score));
    if (!match && (wild.length || bestScore < 0.75)) continue;
    pets.push({ species, description: match && match.probability >= BREED_CONFIDENCE ? breedName(match.className) : species });
  }
  // Wild animals keep their own type ("meerkat", "red fox"), grouped under Pets & animals as wildlife.
  const wildName = predictions.find((p) => p.probability >= 0.2 && wildAnimal(p.className));
  if (wildName && !pets.length) pets.push({ species: "wildlife", description: wildAnimal(wildName.className)! });
  // A close-up pet often fills the frame, which the object detector can miss.
  const sure = predictions.find((p) => p.probability >= BREED_CONFIDENCE && petSpecies(p.className));
  if (sure && !pets.some((p) => p.species === petSpecies(sure.className))) pets.push({ species: petSpecies(sure.className)!, description: breedName(sure.className) });

  let scene: string | null = null;
  for (const p of predictions.filter((x) => x.probability >= 0.15)) {
    scene = SCENE_BY_NAME.get(short(p.className).toLowerCase()) ?? null;
    if (scene) break;
  }
  scene ??= seen.map((d) => COCO_SCENES[d.class]).find(Boolean) ?? null;
  if (!scene && pets.some((p) => p.species === "wildlife")) scene = "wildlife";

  const things = new Set<string>();
  for (const d of seen) if (!IGNORE_THINGS.has(d.class) && !COCO_PETS[d.class]) things.add(FRIENDLY_THING[d.class] ?? d.class);
  const best = predictions[0];
  if (best && best.probability >= 0.4 && !petSpecies(best.className) && !wildAnimal(best.className) && !SCENE_BY_NAME.has(short(best.className).toLowerCase())) things.add(short(best.className).toLowerCase());

  let event: string | null = null;
  const names = new Set(predictions.filter((p) => p.probability >= 0.15).map((p) => short(p.className)));
  if (names.has("groom") || (names.has("gown") && people >= 2)) event = "wedding";
  else if (seen.some((d) => d.class === "cake") && people >= 2) event = "celebration";

  return { people_count: people, pets, things: [...things].slice(0, 6), scene, event, caption: caption(people, pets, scene, [...things]) };
}

function caption(people: number, pets: BrowserTags["pets"], scene: string | null, things: string[]): string {
  const who = people === 0 ? "" : people === 1 ? "A person" : people <= 4 ? `${people} people` : "A group of people";
  const pet = pets.length ? pets.map((p) => `${/^[aeiou]/i.test(p.description) ? "an" : "a"} ${p.description}`).join(" and ") : "";
  const subject = who && pet ? `${who} with ${pet}` : who || (pet ? pet.charAt(0).toUpperCase() + pet.slice(1) : "") || (things[0] ? `A ${things[0]}` : "A photo");
  const where: Record<string, string> = {
    "beach & coast": "at the beach", "lakes & rivers": "by the water", mountains: "in the mountains", underwater: "underwater", snow: "in the snow",
    "landmarks & buildings": "at a landmark", wildlife: "", "food & drink": "with food and drink", "concerts & shows": "at a show", sport: "playing sport",
    "gardens & parks": "in a garden or park", "city & streets": "in the city", "at home": "at home", "screenshots & documents": "(screenshot or document)",
  };
  // "with food and drink" only reads well about people or pets ("2 people with food and drink").
  const place = scene && (scene !== "food & drink" || who || pet) ? where[scene] : "";
  return [subject, place].filter(Boolean).join(" ");
}
