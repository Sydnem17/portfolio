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
/** Other animals the object detector knows; filed under Pets & animals as wildlife, never as "things". */
const COCO_WILD = new Set(["bear", "cow", "elephant", "zebra", "giraffe", "sheep"]);

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
  ["graphics & screenshots", ["web site", "menu", "envelope", "book jacket", "comic book", "crossword puzzle", "monitor", "screen", "notebook", "desktop computer"]],
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
  // The detector also knows a few big animals; trust it only when the classifier sees some animal too.
  const bigAnimal = seen.find((d) => COCO_WILD.has(d.class) && d.score >= 0.7);
  if (bigAnimal && !pets.length && predictions.some((p) => p.probability >= 0.1 && (INDEX.get(p.className) ?? 999) <= 397))
    pets.push({ species: "wildlife", description: bigAnimal.class });
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

  // Things come only from the object detector's 80 everyday objects (laptop, cup, car…). The classifier's
  // 1,000 labels turned app icons, designs and screenshots into "fire screen", "velvet" and "nematode".
  const things = new Set<string>();
  for (const d of seen) if (d.score >= 0.6 && !IGNORE_THINGS.has(d.class) && !COCO_PETS[d.class] && !COCO_WILD.has(d.class)) things.add(FRIENDLY_THING[d.class] ?? d.class);

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
    "gardens & parks": "in a garden or park", "city & streets": "in the city", "at home": "at home", "graphics & screenshots": "",
  };
  // "with food and drink" only reads well about people or pets ("2 people with food and drink").
  const place = scene && (scene !== "food & drink" || who || pet) ? where[scene] : "";
  return [subject, place].filter(Boolean).join(" ");
}

/**
 * Is this a graphic (logo, design, app icon, screenshot, document) rather than a camera photo?
 * Both AI models only know real photos, so on graphics they invent things: the Instagram logo
 * becomes "scissors", the Spotify logo a "cup". Graphics are flat: a handful of exact colours cover
 * most of the picture. Camera photos have noise and gradients, so their colours are spread out.
 */
export interface PixelStats {
  /** Share of pixels in the 4 most common (slightly quantised) colours. */
  top4: number;
  /** How many distinct quantised colours appear. */
  distinct: number;
}

export function pixelStats(rgba: ArrayLike<number>): PixelStats {
  const counts = new Map<number, number>();
  let n = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 16) continue; // transparent background: typical of logos
    const key = ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    n++;
  }
  if (!n) return { top4: 1, distinct: 0 };
  const top = [...counts.values()].sort((a, b) => b - a).slice(0, 4).reduce((s, v) => s + v, 0);
  return { top4: top / n, distinct: counts.size };
}

const CAMERA_NAME = /^(img|dsc|dscn|pxl|mvimg|gopr|dji|p\d{3}|sam|wp)[_-]?\d|^\d{8}[_-]\d{6}|^photo[_ -]?\d/i;
const GRAPHIC_NAME = /screenshot|screen shot|screen_shot|logo|icon|banner|poster|flyer|design|canva|mockup|template|graphic|sticker|emoji|clipart|meme|qr/i;
const GRAPHIC_TYPE = /\.(png|svg|gif|webp|bmp|ico|ai|eps|psd)$/i;

export function looksLikeGraphic(file: { name: string; mime?: string | null }, stats: PixelStats | null, transparent = false): boolean {
  if (transparent) return true;
  if (GRAPHIC_NAME.test(file.name)) return true;
  const camera = CAMERA_NAME.test(file.name) || /\.(heic|heif|dng|cr2|nef|arw)$/i.test(file.name);
  // Measured on 48×48 thumbnails: camera photos show 150–250 colours even with a big plain sky;
  // logos, icons, documents and screenshots show 4–80.
  const flat = stats ? stats.distinct < 100 || (stats.top4 >= 0.8 && stats.distinct < 160) : false;
  if (camera) return !!stats && stats.distinct < 40; // only extreme cases (e.g. a photo of a blank screen)
  if (GRAPHIC_TYPE.test(file.name) || /png|svg|gif|webp/.test(file.mime ?? "")) return !stats || !(stats.distinct >= 160 && stats.top4 < 0.5);
  return flat;
}

export const GRAPHIC_TAGS: BrowserTags = { people_count: 0, pets: [], things: [], scene: "graphics & screenshots", event: null, caption: "A graphic, logo or screenshot" };
