import workbook from './workbook.json';
import { ENRICH_A } from './enrichment-a';
import { ENRICH_B } from './enrichment-b';
import type { Enrichment } from './enrichment';
import type { Film, Source } from './types';

interface WorkbookRow {
  title: string;
  year: number;
  category: string;
  status: string;
  startingPoint: Film['startingPoint'];
  why: string;
  reference: string | null;
  notes: string | null;
  source: string | null;
}

/** Stable id: slugified title plus year, e.g. "crash-1996". Remakes stay distinct by year. */
export function filmId(title: string, year: number): string {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug}-${year}`;
}

// Some watchlist sources are articles about one aspect of a film rather than a film record.
// For those, credits and runtime point to the film's encyclopaedia entry instead.
const CREDIT_PAGES: Record<string, string> = {
  'pretty-in-pink-1986': 'https://en.wikipedia.org/wiki/Pretty_in_Pink',
  'say-anything-1989': 'https://en.wikipedia.org/wiki/Say_Anything...',
  'almost-famous-2000': 'https://en.wikipedia.org/wiki/Almost_Famous',
  'ghost-1990': 'https://en.wikipedia.org/wiki/Ghost_(1990_film)',
  'eternal-sunshine-of-the-spotless-mind-2004': 'https://en.wikipedia.org/wiki/Eternal_Sunshine_of_the_Spotless_Mind',
  'the-matrix-1999': 'https://en.wikipedia.org/wiki/The_Matrix',
  'the-rocky-horror-picture-show-1975': 'https://en.wikipedia.org/wiki/The_Rocky_Horror_Picture_Show',
  'the-big-lebowski-1998': 'https://en.wikipedia.org/wiki/The_Big_Lebowski',
  'stop-making-sense-1984': 'https://en.wikipedia.org/wiki/Stop_Making_Sense',
};

// Additional sources stored against the specific facts they support.
const EXTRA_SOURCES: Record<string, Source[]> = {
  'muriels-wedding-1994': [
    {
      label: 'NFSA: Muriel’s Wedding and ABBA',
      url: 'https://www.nfsa.gov.au/collection/item/muriels-wedding-and-abba',
      supports: ['ABBA connection'],
    },
  ],
  'sex-lies-and-videotape-1989': [
    {
      label: 'Criterion Collection',
      url: 'https://www.criterion.com/films/28832-sex-lies-and-videotape',
      supports: ["Palme d'Or and Cannes Best Actor"],
    },
  ],
};

function hostLabel(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, '');
  const known: Record<string, string> = {
    'catalog.afi.com': 'AFI Catalog',
    'afi.com': 'American Film Institute',
    'acmi.net.au': 'ACMI',
    'criterion.com': 'Criterion Collection',
    'en.wikipedia.org': 'Wikipedia',
    'aso.gov.au': 'Australian Screen Online (NFSA)',
    'nfsa.gov.au': 'National Film and Sound Archive',
    'a24films.com': 'A24',
    'bfi.org.uk': 'BFI',
    'player.bfi.org.uk': 'BFI Player',
    'petergabriel.com': 'Peter Gabriel (official)',
    'eltonjohn.com': 'Elton John (official)',
    'udiscovermusic.com': 'uDiscover Music',
    'universalpicturesathome.com': 'Universal Pictures',
    'paramount.com': 'Paramount',
    '20thcenturystudios.com': '20th Century Studios',
    'parkcircus.com': 'Park Circus',
  };
  return known[host] ?? host;
}

function buildFilm(row: WorkbookRow, e: Enrichment): Film {
  const id = filmId(row.title, row.year);
  const sources: Source[] = [];
  const creditPage = CREDIT_PAGES[id];
  if (row.source) {
    sources.push({
      label: hostLabel(row.source),
      url: row.source,
      supports: creditPage ? ['watchlist reference'] : ['film record', 'year', 'credits', 'runtime'],
    });
  }
  if (creditPage) {
    sources.push({ label: 'Wikipedia', url: creditPage, supports: ['film record', 'year', 'credits', 'runtime'] });
  }
  sources.push(...(EXTRA_SOURCES[id] ?? []));

  const watchlistNote =
    row.notes && !/^You (requested|said)/.test(row.notes) ? row.notes : undefined;

  return {
    id,
    title: row.title,
    year: row.year,
    yearNote: e.yn,
    versionNote: e.vn,
    directors: e.d,
    cast: e.c.map((c) => (typeof c === 'string' ? { name: c } : c)),
    runtime: e.r,
    category: row.category,
    genres: e.g,
    moods: e.m,
    intro: e.i,
    why: row.why,
    references: (row.reference ?? '').split(';').map((s) => s.trim()).filter(Boolean),
    contentNote: e.note,
    intense: e.intense,
    subtitled: e.sub,
    storySetting: e.set,
    spoiler: e.sp,
    aliases: e.al,
    userPick: row.startingPoint === 'User pick',
    startingPoint: row.startingPoint,
    watchlistNote,
    sources,
  };
}

const ENRICH: Record<string, Enrichment> = { ...ENRICH_A, ...ENRICH_B };

function build(): Film[] {
  const seen = new Set<string>();
  const films: Film[] = [];
  for (const row of workbook as WorkbookRow[]) {
    const key = `${row.title}|${row.year}`;
    const e = ENRICH[key];
    if (!e) throw new Error(`Missing enrichment for ${key}`);
    const film = buildFilm(row, e);
    // Deduplicate by identity (title + year + first director).
    const identity = `${film.title.toLowerCase()}|${film.year}|${film.directors[0] ?? ''}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    films.push(film);
  }
  return films;
}

export const SEED_FILMS: Film[] = build();
export const SEED_BY_ID: Record<string, Film> = Object.fromEntries(SEED_FILMS.map((f) => [f.id, f]));

/** Films confirmed as watched and loved in the brief. Only these start as watched on a fresh install. */
export const CONFIRMED_FAVOURITES = ['muriels-wedding-1994', 'the-breakfast-club-1985'] as const;

export const CATEGORIES: string[] = Array.from(new Set(SEED_FILMS.map((f) => f.category)));
