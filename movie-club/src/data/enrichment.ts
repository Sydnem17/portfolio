import type { CastCredit, GenreId, MoodId, StorySetting } from './types';

/** Compact authoring format for per-film research, expanded in catalogue.ts. */
export interface Enrichment {
  /** Directors */
  d: string[];
  /** Cast: names, or credits with verified role names */
  c: (string | CastCredit)[];
  /** Theatrical runtime in minutes, or null when not verified */
  r: number | null;
  g: GenreId[];
  m: MoodId[];
  /** Spoiler-free introduction */
  i: string;
  /** Optional content note */
  note?: string;
  intense?: boolean;
  sub?: boolean;
  /** Year note */
  yn?: string;
  /** Version note */
  vn?: string;
  set?: StorySetting;
  /** Spoiler-bearing text, hidden unless revealed per film */
  sp?: string;
  /** Search aliases: quotations, props, nicknames */
  al?: string[];
}
