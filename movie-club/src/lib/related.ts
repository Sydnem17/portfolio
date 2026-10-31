import { ARTIST_BY_ID, DOUBLE_BILLS, MUSIC, MUSIC_BY_FILM, TRAILS } from '../data/connections';
import type { ConnectionType } from '../data/types';
import type { ResolvedFilm } from '../state/model';

export interface Related {
  film: ResolvedFilm;
  type: ConnectionType;
  why: string;
}

/** Related discoveries, each with the kind of connection stated. Spoiler-bearing trails are skipped. */
export function relatedFor(film: ResolvedFilm, byId: Map<string, ResolvedFilm>, limit = 6): Related[] {
  const out: Related[] = [];
  const seen = new Set([film.id]);
  const push = (id: string | undefined, type: ConnectionType, why: string) => {
    const f = id ? byId.get(id) : undefined;
    if (!f || seen.has(f.id) || f.me.archived) return;
    seen.add(f.id);
    out.push({ film: f, type, why });
  };

  for (const t of TRAILS) {
    if (t.spoilerTeaser) continue;
    if (t.connection.filmId === film.id && t.next.type) push(t.next.filmId, t.next.type, t.next.body);
  }
  for (const b of DOUBLE_BILLS) {
    if (b.first === film.id) push(b.second, b.editorial ? 'suggested-pairing' : b.basis === 'music' ? 'performed-by' : 'shares-person', b.note);
    if (b.second === film.id) push(b.first, b.editorial ? 'suggested-pairing' : b.basis === 'music' ? 'performed-by' : 'shares-person', b.note);
  }
  for (const m of MUSIC_BY_FILM[film.id] ?? []) {
    for (const other of MUSIC.filter((x) => x.artistId === m.artistId && x.filmId && x.filmId !== film.id)) {
      push(other.filmId, 'performed-by', `Music link: ${ARTIST_BY_ID[m.artistId]?.name}, "${m.song}" here and "${other.song}" there.`);
    }
  }
  for (const t of TRAILS) {
    if (t.spoilerTeaser) continue;
    if (t.next.filmId === film.id && t.connection.filmId && t.next.type && t.next.type !== 'suggested-pairing') {
      push(t.connection.filmId, t.next.type, t.next.body);
    }
  }
  for (const f of byId.values()) {
    if (out.length >= limit) break;
    const d = film.directors.find((x) => f.directors.includes(x));
    if (d) push(f.id, 'shares-person', `Also directed by ${d}.`);
  }
  for (const f of byId.values()) {
    if (out.length >= limit) break;
    const c = film.cast.find((x) => f.cast.some((y) => y.name === x.name));
    if (c) push(f.id, 'shares-person', `${c.name} is in both.`);
  }
  return out.slice(0, limit);
}
