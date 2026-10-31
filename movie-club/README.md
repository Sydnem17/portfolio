# Taryn's Movie Club

**The films. The music. The references.**

A personal film-discovery app for Taryn. It helps you choose tonight's film, follow a song or a famous line back to the film it came from, and plan a double bill. Everything runs in the browser. You don't need an account, a subscription or an API key.

## Run it

You need Node 20 or later.

```bash
cd movie-club
npm install
npm run dev          # http://localhost:5173
```

Other commands:

| Command | What it does |
| --- | --- |
| `npm test` | Runs the Vitest suite (48 tests) |
| `npm run typecheck` | Runs the TypeScript checks |
| `npm run build` | Builds a static site into `dist/` |
| `npm run preview` | Serves the build at http://localhost:4173 |
| `npm run e2e` | Browser smoke test of the core journey (26 checks). Run `npm run preview` first. It uses Playwright with Chromium. |
| `npm run import:workbook -- path/to/watchlist.xlsx` | Regenerates `src/data/workbook.json` from the watchlist workbook (needs Python 3 and `openpyxl`) |

`dist/` is a plain static site that uses relative paths and hash routing. You can host it on any static host or open it from a local server.

## What's in it

| Area | What it does |
| --- | --- |
| **Discover** | "Pick tonight's film", Donnie Darko and Stop Making Sense features, Your picks, and Always a favourite (led by Muriel's Wedding), plus a reference teaser, a double bill and the mystery shelf. |
| **Tonight's three** | Asks for mood, time, familiar or new, and exclusions. Returns a familiar favourite, a new discovery and a wildcard, each with its reasons. Hard filters always win. A film with an unknown runtime never qualifies for a time limit. When a slot is empty, the app says why. The picks come from rules, not an AI service. |
| **My films** | All 136 films. Search, filters (decade, mood, status, genre, person, shelf, your picks, archived), active-filter chips with reset, shelf and list views, and sorting. Add, edit, archive and restore films. Create named shelves; a film can sit on several. |
| **Film pages** | Credits, runtime, version and year notes, spoiler-free intro, "Why it's here", content notes, music companion, reference trails, related films with the connection type, Australian availability search, and sources (tucked away). Your controls: viewing status, reaction, rewatch flag, "I recognise", notes, shelves. Each one is stored separately. |
| **Follow the reference** | 17 sourced trails: something you recognise, its film, why it stuck, then one next discovery. Each connection states its type. One trail carries a spoiler and asks before revealing it. If nothing matches, you get a no-match state, not a guess. |
| **Music** | 31 music links across 22 artists. Talking Heads lead the page. Each link says whether it's heard in the film, on the soundtrack album or suggested listening. It also flags covers and re-recordings. Links go to verified official pages where one exists. Otherwise they are search links labelled as searches. "Follow this sound" goes from film to artist to the next film. Nothing plays automatically. |
| **Double bills** | Nine starting pairings, including Muriel's Wedding with Priscilla and several built around music. The builder offers "More of the same feeling" or "Change the mood for film two", respects exclusions and never repeats a film. Set the interval, and the evening total only appears when both runtimes are known. Save the plan, then download (or explicitly share) a PNG admission ticket. |
| **Time machine** | Two clocks: release decade, or the decade the story is set in (24 films have a story setting). |
| **James Spader** | 12 films in date order with role, lead or supporting, director and viewing mood. A Less / Normal / More control changes how often his films come up in suggestions. |
| **Mystery shelf** | Three spoiler-free clues, with no title, cover or label until you reveal the film. |
| **Settings** | Preferences, optional artwork key, JSON backup and restore with an import preview, CSV export, and reset (with undo). |

### Your data

- On a fresh install, only **Muriel's Wedding** and **The Breakfast Club** start as watched and loved. Everything else starts as unknown. Later edits are never reset.
- Personal changes are stored apart from the catalogue, so catalogue updates can't erase your statuses, reactions, notes or shelves. Corrections to catalogue facts are stored as overrides.
- Saves stay in this browser on this device (`localStorage`). There's **no cross-device sync**: use Export and Import to move your collection.
- Imports show a preview first. Invalid records are skipped with a reason, and duplicate added films are merged. Existing notes are kept unless you choose otherwise.
- Most actions offer Undo. If storage is unavailable or full, a banner says so and the app keeps working for that visit. If saved data is corrupt, the unreadable copy is kept and the app starts fresh.

## What was checked

- **48 unit and component tests** (`npm test`) cover:
  - exactly two watched-and-loved films on first run
  - recognising a reference leaves viewing status alone
  - hard exclusions
  - unknown runtimes and strict time limits
  - no duplicate film in a double bill
  - spoilers hidden in cards, film pages, search results and trails
  - mystery answers kept out of the page before reveal
  - notes and reactions surviving reloads and catalogue updates
  - export and import round-trips, invalid files and duplicates
  - catalogue integrity
- **Browser smoke test** (`npm run e2e`) passes 26 of 26 checks. It drives the core journey with the keyboard where relevant: pick a film, follow a reference, update personal state, reload, export, reset, restore. It also checks the CSV and ticket downloads, and a 360 px phone layout (no horizontal overflow, bottom navigation in thumb reach).
- **axe-core audit** of 14 pages at desktop and phone widths found no WCAG A/AA or best-practice violations.

## Limitations to know about

1. **Facts weren't checked live.** The build environment could only reach package registries, not film databases or encyclopaedias. Credits, runtimes, song credits and story settings come from established reference knowledge. Each is linked to the source page it should be checked against. Where a fact wasn't certain, it was left empty: eight films have no runtime, for example. These claims are worth spot-checking first:
   - fans marking Rex Manning Day on 8 April
   - David Byrne's suit and Japanese theatre
   - the INXS song in the Donnie Darko Director's Cut
   - the Righteous Brothers in Top Gun
2. **Artwork.** By default, every film gets a title-led "club cover". These are deliberate typographic designs, labelled as such, not official posters. Official posters appear if you add your own free TMDB key in Settings. The key stays in your browser and is left out of backups. TMDB couldn't be reached from the build environment, so that path is untested.
3. **Where to watch** opens a JustWatch Australia search. The app doesn't show provider availability because it has no live source for it.
4. **Undo inside dialogs.** An Undo message triggered inside a dialog (for example, deleting a shelf) can only be clicked after the dialog closes. It stays up for 8 seconds.
5. **Not deployed.** No hosting was set up from this environment. Run it locally with the commands above, or deploy `dist/` to any static host.

## Project layout

```
src/
  data/       catalogue (workbook.json + enrichment), connections (trails, music, double bills), types
  state/      personal state model, storage, backup/import/CSV, React store with undo
  lib/        search, Tonight picker, double bills, mystery clues, related films, ticket, links, TMDB
  components/ covers, cards, dialogs, music card, Tonight dialog
  pages/      Discover, My films, Film, Connections (trails, double bills, time machine, Spader, mystery), Music, Search, Settings
test/         Vitest suites
e2e/smoke.mjs Playwright journey check
scripts/      workbook import
```
