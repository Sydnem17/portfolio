import { useEffect, useState } from 'react';

// Minimal hash router: works on any static host and offline, with real back/forward history.
export interface Route {
  path: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [p, q = ''] = raw.split('?');
  return { path: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function href(path: string): string {
  return `#${path.startsWith('/') ? path : `/${path}`}`;
}

export function navigate(path: string) {
  const next = href(path);
  if (window.location.hash === next) return;
  window.location.hash = next;
}

export const filmHref = (id: string) => href(`/film/${encodeURIComponent(id)}`);
