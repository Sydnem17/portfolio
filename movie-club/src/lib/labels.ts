import type { GenreId, MoodId } from '../data/types';

export const MOOD_LABEL: Record<MoodId, string> = {
  'warm-funny': 'Warm and funny',
  'music-nostalgia': 'Music and nostalgia',
  'beautifully-strange': 'Beautifully strange',
  'clever-unsettling': 'Clever and unsettling',
  'big-adventure': 'Big adventure',
  romantic: 'Romantic',
  bittersweet: 'Bittersweet',
  heartfelt: 'Heartfelt',
  tense: 'Tense',
  dark: 'Dark',
  thoughtful: 'Thoughtful',
  quotable: 'Endlessly quotable',
  rousing: 'Rousing',
  provocative: 'Provocative',
};

/** The moods offered by the film-night picker. */
export const PICKER_MOODS: MoodId[] = [
  'warm-funny',
  'music-nostalgia',
  'beautifully-strange',
  'clever-unsettling',
  'big-adventure',
];

export const GENRE_LABEL: Record<GenreId, string> = {
  comedy: 'Comedy',
  romance: 'Romance',
  drama: 'Drama',
  musical: 'Musical',
  music: 'Music',
  concert: 'Concert film',
  teen: 'Teen',
  fantasy: 'Fantasy',
  family: 'Family',
  animation: 'Animation',
  'sci-fi': 'Science fiction',
  action: 'Action',
  adventure: 'Adventure',
  thriller: 'Thriller',
  horror: 'Horror',
  crime: 'Crime',
  mystery: 'Mystery',
  history: 'History',
};

export function decadeOf(year: number): number {
  return Math.floor(year / 10) * 10;
}

export function decadeLabel(decade: number): string {
  return `${decade}s`;
}

export function formatRuntime(mins: number | null): string {
  if (mins == null) return 'Runtime not verified';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h} hr ${m ? `${m} min` : ''}`.trim() : `${m} min`;
}

export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
