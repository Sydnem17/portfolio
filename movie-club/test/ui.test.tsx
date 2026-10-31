import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FilmCard } from '../src/components/FilmCard';
import { SEED_BY_ID } from '../src/data/catalogue';
import { FilmDetail } from '../src/pages/FilmDetail';
import { Mystery } from '../src/pages/Mystery';
import { SearchPage } from '../src/pages/Search';
import { Trails } from '../src/pages/Trails';
import { freshState, updatePersonal } from '../src/state/model';
import { STORAGE_KEY, loadState } from '../src/state/storage';
import { StoreProvider, useStore } from '../src/state/store';
import { memoryStore } from './helpers';

afterEach(cleanup);

const EMPIRE = 'the-empire-strikes-back-1980';
const SPOILER = SEED_BY_ID[EMPIRE].spoiler!;

function withState(state = freshState()) {
  return memoryStore({ [STORAGE_KEY]: JSON.stringify(state) });
}

function CardFor({ id }: { id: string }) {
  const { byId } = useStore();
  return <FilmCard film={byId.get(id)!} />;
}

describe('spoiler protection in the interface', () => {
  it('keeps spoilers out of cards, detail pages and search results by default', () => {
    const store = withState();
    const { container, unmount } = render(
      <StoreProvider store={store}>
        <CardFor id={EMPIRE} />
        <FilmDetail id={EMPIRE} />
        <SearchPage q="empire strikes back father" />
        <SearchPage q="empire" />
      </StoreProvider>,
    );
    expect(container.textContent).not.toContain(SPOILER);
    expect(container.textContent).not.toContain('No, I am your father');
    expect(screen.getByRole('button', { name: /Reveal spoilers for this film/ })).toBeTruthy();
    unmount();
  });

  it('does not reveal spoilers when a film is marked watched', () => {
    const store = withState(updatePersonal(freshState(), EMPIRE, { status: 'watched', reaction: 'loved' }));
    const { container } = render(
      <StoreProvider store={store}>
        <FilmDetail id={EMPIRE} />
      </StoreProvider>,
    );
    expect(container.textContent).not.toContain(SPOILER);
  });

  it('shows spoilers only after they are revealed for that film', () => {
    const store = withState(updatePersonal(freshState(), EMPIRE, { spoilers: true }));
    const { container } = render(
      <StoreProvider store={store}>
        <FilmDetail id={EMPIRE} />
      </StoreProvider>,
    );
    expect(container.textContent).toContain(SPOILER);
  });

  it('asks before showing a spoiler-bearing reference trail', () => {
    const { container } = render(
      <StoreProvider store={withState()}>
        <Trails trailId="misquoted-father" query={new URLSearchParams()} />
      </StoreProvider>,
    );
    expect(container.textContent).not.toContain('No, I am your father');
    expect(screen.getByRole('button', { name: 'Reveal this trail' })).toBeTruthy();
  });
});

describe('mystery shelf', () => {
  it('keeps the answer out of the page, labels and images until revealed', () => {
    for (let i = 0; i < 15; i++) {
      const { container, unmount } = render(
        <StoreProvider store={withState()}>
          <Mystery />
        </StoreProvider>,
      );
      const before = container.innerHTML;
      expect(container.querySelectorAll('img, [role="img"]').length).toBe(0);
      fireEvent.click(screen.getByRole('button', { name: 'Reveal the film' }));
      const title = container.querySelector('#revealed-h')!.textContent!;
      expect(title.length).toBeGreaterThan(0);
      const escaped = title.replace(/&/g, '&amp;');
      expect(before).not.toContain(escaped);
      unmount();
    }
  });
});

describe('notes and reactions', () => {
  it('survive a reload of the app', async () => {
    const store = memoryStore();
    const first = render(
      <StoreProvider store={store}>
        <FilmDetail id="ghost-1990" />
      </StoreProvider>,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Mixed' }));
    const notes = screen.getByLabelText('Your notes');
    fireEvent.change(notes, { target: { value: 'Bring tissues' } });
    fireEvent.blur(notes);
    await act(async () => {});
    first.unmount();

    const saved = loadState(store).state;
    expect(saved.films['ghost-1990']).toMatchObject({ reaction: 'mixed', notes: 'Bring tissues', status: 'unknown' });

    render(
      <StoreProvider store={store}>
        <FilmDetail id="ghost-1990" />
      </StoreProvider>,
    );
    expect((screen.getByLabelText('Your notes') as HTMLTextAreaElement).value).toBe('Bring tissues');
    expect((screen.getByRole('radio', { name: 'Mixed' }) as HTMLInputElement).checked).toBe(true);
  });

  it('recognising a reference on a film page leaves viewing status alone', async () => {
    const store = memoryStore();
    render(
      <StoreProvider store={store}>
        <FilmDetail id="ghost-1990" />
      </StoreProvider>,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /I recognise/ }));
    await act(async () => {});
    const saved = loadState(store).state;
    expect(saved.recognised['pottery-wheel']).toBeTruthy();
    expect(saved.films['ghost-1990']?.status ?? 'unknown').toBe('unknown');
  });
});
