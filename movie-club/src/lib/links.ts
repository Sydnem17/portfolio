// External links. Search links are labelled as searches and never presented as verified tracks.
export function musicSearchLinks(song: string, artist: string) {
  const q = encodeURIComponent(`${song} ${artist}`);
  return [
    { service: 'Spotify', url: `https://open.spotify.com/search/${q}` },
    { service: 'Apple Music', url: `https://music.apple.com/au/search?term=${q}` },
    { service: 'YouTube', url: `https://www.youtube.com/results?search_query=${q}` },
  ];
}

/** Australian availability search. A search, not a claim that the film is streaming. */
export function whereToWatchAu(title: string, year: number) {
  return `https://www.justwatch.com/au/search?q=${encodeURIComponent(`${title} ${year}`)}`;
}
