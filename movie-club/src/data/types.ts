// Catalogue (seed) types. Seed content is never written to; personal state lives in src/state.

export type MoodId =
  | 'warm-funny'
  | 'music-nostalgia'
  | 'beautifully-strange'
  | 'clever-unsettling'
  | 'big-adventure'
  | 'romantic'
  | 'bittersweet'
  | 'heartfelt'
  | 'tense'
  | 'dark'
  | 'thoughtful'
  | 'quotable'
  | 'rousing'
  | 'provocative';

export type GenreId =
  | 'comedy'
  | 'romance'
  | 'drama'
  | 'musical'
  | 'music'
  | 'concert'
  | 'teen'
  | 'fantasy'
  | 'family'
  | 'animation'
  | 'sci-fi'
  | 'action'
  | 'adventure'
  | 'thriller'
  | 'horror'
  | 'crime'
  | 'mystery'
  | 'history';

export interface Source {
  label: string;
  url: string;
  /** What this source is cited for, e.g. ['credits', 'runtime'] or ['song credit']. */
  supports: string[];
}

export interface CastCredit {
  name: string;
  role?: string;
  /** True when the performance is a supporting one. Only set where it matters (e.g. the Spader shelf). */
  supporting?: boolean;
}

export interface StorySetting {
  /** Human label, e.g. "Summer 1963" or "Late 1950s". Never more precise than the source. */
  label: string;
  /** First and last year covered, used for era browsing. */
  from: number;
  to: number;
  place?: string;
}

export interface Film {
  id: string;
  title: string;
  year: number;
  /** Release-year caveats, e.g. Heathers' festival premiere or Dream Lover's US release. */
  yearNote?: string;
  /** Edition / cut information that matters for runtime or music. */
  versionNote?: string;
  directors: string[];
  cast: CastCredit[];
  /** Theatrical runtime in minutes. Null when not verified. */
  runtime: number | null;
  category: string;
  genres: GenreId[];
  moods: MoodId[];
  /** Spoiler-free introduction. */
  intro: string;
  /** Editorial "why it's here". */
  why: string;
  /** Short, spoiler-free cultural reference hooks from the watchlist. */
  references: string[];
  contentNote?: string;
  /** Mature or intense content, used by the "nothing too intense" exclusion. */
  intense?: boolean;
  subtitled?: boolean;
  storySetting?: StorySetting;
  /** Spoiler-bearing material. Never rendered unless the viewer reveals spoilers for this film. */
  spoiler?: string;
  aliases?: string[];
  userPick?: boolean;
  startingPoint: 'User pick' | 'Known favourite' | 'Suggested next' | 'Explore' | 'Added by you';
  watchlistNote?: string;
  sources: Source[];
  /** True for films added by the user rather than the seed catalogue. */
  custom?: boolean;
}

export type ConnectionType =
  | 'appears-in'
  | 'performed-by'
  | 'shares-person'
  | 'cultural-reference'
  | 'suggested-pairing';

export const CONNECTION_LABEL: Record<ConnectionType, string> = {
  'appears-in': 'Appears in this film',
  'performed-by': 'Performed by this artist',
  'shares-person': 'Shares this actor or filmmaker',
  'cultural-reference': 'Related cultural reference',
  'suggested-pairing': 'Our suggested pairing',
};

export interface TrailStep {
  heading: string;
  body: string;
  filmId?: string;
  type?: ConnectionType;
  sourceIndex?: number[];
}

export interface ReferenceTrail {
  id: string;
  /** The thing you might recognise. For spoiler trails this is spoiler-safe. */
  cue: string;
  cueKind: 'song' | 'quotation' | 'actor' | 'prop' | 'visual' | 'event';
  aliases: string[];
  /** If present, the trail is spoiler-bearing and the teaser is shown until revealed. */
  spoilerTeaser?: string;
  recognise: TrailStep;
  connection: TrailStep;
  memorable: TrailStep;
  next: TrailStep;
  sources: Source[];
}

export type MusicKind = 'heard' | 'soundtrack' | 'suggested';

export const MUSIC_KIND_LABEL: Record<MusicKind, string> = {
  heard: 'Heard in the film',
  soundtrack: 'On the soundtrack album',
  suggested: 'Suggested listening',
};

export interface Artist {
  id: string;
  name: string;
  blurb: string;
  related?: { artistId: string; note: string }[];
  officialUrl?: string;
}

export interface MusicLink {
  id: string;
  filmId?: string;
  song: string;
  artistId: string;
  kind: MusicKind;
  /** Recording / version detail where it matters (covers, re-recordings, live versions). */
  version?: string;
  writers?: string;
  note: string;
  /** Verified official page, if one exists. Otherwise the UI offers labelled search links. */
  officialUrl?: string;
  officialLabel?: string;
  sources: Source[];
}

export interface DoubleBill {
  id: string;
  first: string;
  second: string;
  basis: 'theme' | 'music' | 'performer' | 'filmmaker' | 'contrast';
  feeling: 'same' | 'change';
  note: string;
  editorial: boolean;
}
