import { createContext, useContext, useEffect, useRef, useState, type FormEvent } from 'react';
import { BrandMark, Icon } from './components/Icon';
import { TonightDialog } from './components/TonightDialog';
import { Connections } from './pages/Connections';
import { Discover } from './pages/Discover';
import { FilmDetail } from './pages/FilmDetail';
import { MusicPage } from './pages/Music';
import { MyFilms } from './pages/MyFilms';
import { SearchPage } from './pages/Search';
import { Settings } from './pages/Settings';
import { href, navigate, useRoute } from './router';
import { useStore } from './state/store';

const TonightContext = createContext<() => void>(() => {});
export const useOpenTonight = () => useContext(TonightContext);

const NAV = [
  { key: '', label: 'Discover', icon: 'discover' },
  { key: 'films', label: 'My films', icon: 'films' },
  { key: 'connections', label: 'Connections', icon: 'connections' },
  { key: 'music', label: 'Music', icon: 'music' },
];

const PAGE_TITLES: Record<string, string> = {
  '': 'Discover',
  films: 'My films',
  film: 'Film',
  connections: 'Connections',
  music: 'Music',
  settings: 'Settings',
  search: 'Search',
};

export default function App() {
  const route = useRoute();
  const section = route.path[0] ?? '';
  const { films, toast, dismissToast, undo, canUndo, announcement, health, retrySave } = useStore();
  const [tonightOpen, setTonightOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  // Move focus to the main region on route change so keyboard and screen-reader users land in context.
  useEffect(() => {
    document.title = `${PAGE_TITLES[section] ?? 'Discover'} · Taryn’s Movie Club`;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [route.path.join('/')]);

  // Auto-dismiss confirmations, but leave enough time to reach Undo.
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(dismissToast, toast.undoable ? 8000 : 4000);
    return () => window.clearTimeout(t);
  }, [toast, dismissToast]);

  const active = films.filter((f) => !f.me.archived);
  const lovedCount = active.filter((f) => f.me.status === 'watched' && f.me.reaction === 'loved').length;

  let page: JSX.Element;
  switch (section) {
    case 'film':
      page = <FilmDetail id={route.path[1] ?? ''} />;
      break;
    case 'films':
      page = <MyFilms query={route.query} />;
      break;
    case 'connections':
      page = <Connections tab={route.path[1]} sub={route.path[2]} query={route.query} />;
      break;
    case 'music':
      page = <MusicPage artistId={route.path[1]} />;
      break;
    case 'settings':
      page = <Settings />;
      break;
    case 'search':
      page = <SearchPage q={route.query.get('q') ?? ''} />;
      break;
    default:
      page = <Discover />;
  }

  return (
    <TonightContext.Provider value={() => setTonightOpen(true)}>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>
        Skip to content
      </a>
      <div className="app">
        <aside className="rail" aria-label="Main navigation">
          <a className="brand" href={href('/')}>
            <BrandMark />
            <span className="brand-word">Movie Club</span>
          </a>
          <nav aria-label="Main">
            <ul>
              {NAV.map((n) => (
                <li key={n.key}>
                  <a className="rail-link" href={href(`/${n.key}`)} aria-current={section === n.key ? 'page' : undefined}>
                    <Icon name={n.icon} />
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="rail-foot">
            <button type="button" className="btn btn-primary rail-tonight" onClick={() => setTonightOpen(true)}>
              <Icon name="sparkle" size={18} /> Pick tonight&rsquo;s film
            </button>
            <a className="rail-link" href={href('/settings')} aria-current={section === 'settings' ? 'page' : undefined}>
              <Icon name="settings" />
              Settings
            </a>
          </div>
        </aside>

        <main id="main" ref={mainRef} tabIndex={-1} className="main" style={{ outline: 'none' }}>
          <header className="topbar">
            <a className="brand mobile-only" href={href('/')} aria-label="Taryn's Movie Club, home">
              <BrandMark />
            </a>
            <div className="topbar-title">
              <p className="desktop-only" style={{ fontFamily: 'var(--display)', fontWeight: 750, fontSize: 'clamp(26px,3vw,38px)', color: 'var(--ink)', lineHeight: 1.1 }}>
                Taryn&rsquo;s Movie Club
              </p>
              <p className="desktop-only">The films. The music. The references.</p>
              <p className="mobile-only" style={{ fontFamily: 'var(--display)', fontWeight: 750, fontSize: 19, color: 'var(--ink)' }}>
                Taryn&rsquo;s Movie Club
              </p>
            </div>
            <div className="topbar-tools">
              <HeaderSearch initial={section === 'search' ? route.query.get('q') ?? '' : ''} />
              <div className="counts desktop-only" aria-label="Collection summary">
                <span>{active.length} films</span>
                <span>
                  {lovedCount} watched &amp; loved
                </span>
              </div>
              <a className="icon-btn mobile-only" href={href('/settings')} aria-label="Settings">
                <Icon name="settings" />
              </a>
            </div>
          </header>

          {!health.ok && (
            <div className="banner" role="alert">
              <div>
                <strong>
                  {health.reason === 'full'
                    ? 'This browser’s storage is full, so recent changes are not saved.'
                    : health.reason === 'corrupt-recovered'
                      ? 'Your saved collection could not be read, so the app started fresh.'
                      : 'Changes can’t be saved in this browser right now.'}
                </strong>{' '}
                {health.reason === 'corrupt-recovered'
                  ? 'The unreadable copy was kept in this browser. If you have a backup file, restore it in Settings.'
                  : 'Everything still works for this visit. Export a backup from Settings to keep your changes.'}
              </div>
              <div className="row-wrap">
                {health.reason !== 'corrupt-recovered' && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={retrySave}>
                    Try saving again
                  </button>
                )}
                <a className="btn btn-secondary btn-sm" href={href('/settings')}>
                  Backup and restore
                </a>
              </div>
            </div>
          )}

          {page}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Main">
        {NAV.slice(0, 2).map((n) => (
          <a key={n.key} href={href(`/${n.key}`)} aria-current={section === n.key ? 'page' : undefined}>
            <Icon name={n.icon} />
            {n.label}
          </a>
        ))}
        <button type="button" className="tonight-tab" onClick={() => setTonightOpen(true)}>
          <Icon name="sparkle" />
          Tonight
        </button>
        {NAV.slice(2).map((n) => (
          <a key={n.key} href={href(`/${n.key}`)} aria-current={section === n.key ? 'page' : undefined}>
            <Icon name={n.icon} />
            {n.label}
          </a>
        ))}
      </nav>

      <TonightDialog open={tonightOpen} onClose={() => setTonightOpen(false)} />

      {toast && (
        <div className="toast" key={toast.id}>
          <span>{toast.message}</span>
          {toast.undoable && canUndo && (
            <button type="button" className="btn" onClick={undo}>
              <Icon name="undo" size={16} /> Undo
            </button>
          )}
          <button type="button" className="icon-btn" onClick={dismissToast} aria-label="Dismiss message">
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      <div className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </div>
    </TonightContext.Provider>
  );
}

function HeaderSearch({ initial }: { initial: string }) {
  const [q, setQ] = useState(initial);
  useEffect(() => setQ(initial), [initial]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };
  return (
    <form className="search-form" role="search" aria-label="Site search" onSubmit={submit}>
      <Icon name="search" />
      <label className="visually-hidden" htmlFor="site-search">
        Find a film, person, song or reference
      </label>
      <input
        id="site-search"
        type="search"
        placeholder="Find a film"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoComplete="off"
        enterKeyHint="search"
      />
    </form>
  );
}
