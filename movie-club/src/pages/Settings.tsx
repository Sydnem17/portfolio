import { useRef, useState } from 'react';
import { Dialog, ExternalLink, RadioGroup } from '../components/ui';
import { clearPosterCache } from '../lib/tmdb';
import { freshState } from '../state/model';
import { DEFAULT_IMPORT_OPTIONS, applyImport, exportBackup, previewImport, toCsv, type ImportOptions, type ImportPreview } from '../state/io';
import { useStore } from '../state/store';

function downloadText(name: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export function Settings() {
  const { state, commit, announce, health, films } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState('');
  const [opts, setOpts] = useState<ImportOptions>(DEFAULT_IMPORT_OPTIONS);
  const [resetOpen, setResetOpen] = useState(false);
  const [token, setToken] = useState(state.prefs.tmdbToken ?? '');

  const counts = {
    personal: Object.keys(state.films).length,
    shelves: state.shelves.length,
    added: Object.keys(state.customFilms).length,
    plans: state.savedPlans.length,
  };

  const onFile = async (file: File | undefined) => {
    setImportError('');
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error('That file is too large to be a Movie Club backup.');
      const text = await file.text();
      setOpts(DEFAULT_IMPORT_OPTIONS);
      setPreview(previewImport(state, text));
    } catch (e) {
      setImportError((e as Error).message);
      announce('Import failed.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div style={{ maxWidth: 860 }}>
      <div className="page-head">
        <h1>Settings</h1>
        <p>Preferences, artwork, and moving your collection with backups.</p>
      </div>

      <section className="panel stack" aria-labelledby="prefs-h">
        <h2 id="prefs-h">Preferences</h2>
        <RadioGroup<0 | 1 | 2>
          legend="James Spader films in suggestions"
          name="pref-spader"
          value={state.prefs.spaderWeight}
          options={[
            { value: 0, label: 'Less' },
            { value: 1, label: 'Normal' },
            { value: 2, label: 'More' },
          ]}
          onChange={(v) => commit((s) => ({ ...s, prefs: { ...s.prefs, spaderWeight: v } }), 'Preference saved.')}
        />
        <div className="field" style={{ maxWidth: 280 }}>
          <label htmlFor="pref-interval">Double-bill interval (minutes)</label>
          <input
            id="pref-interval"
            type="number"
            min={0}
            max={120}
            value={state.prefs.interval}
            onChange={(e) => {
              const v = Math.max(0, Math.min(120, Math.round(Number(e.target.value) || 0)));
              commit((s) => ({ ...s, prefs: { ...s.prefs, interval: v } }), undefined, { undoable: false });
            }}
          />
        </div>
        <p className="small muted">
          Spoilers are always hidden by default and controlled film by film. Marking a film watched never reveals them.
        </p>
      </section>

      <section className="panel stack" aria-labelledby="art-h">
        <h2 id="art-h">Artwork</h2>
        <p className="small">
          Out of the box, every film gets a title-led club cover. They are our own designs, not official posters. If you have a free{' '}
          <ExternalLink href="https://www.themoviedb.org/settings/api">TMDB API key or read access token</ExternalLink>, add it here to show official poster artwork instead.
        </p>
        <form
          className="row-wrap"
          style={{ alignItems: 'flex-end' }}
          onSubmit={(e) => {
            e.preventDefault();
            const t = token.trim();
            clearPosterCache();
            commit((s) => ({ ...s, prefs: { ...s.prefs, tmdbToken: t || undefined } }), t ? 'Artwork key saved. Posters will load where TMDB has them.' : 'Artwork key removed.', { undoable: false });
          }}
        >
          <div className="field" style={{ flex: '1 1 280px' }}>
            <label htmlFor="tmdb">TMDB key or token (optional)</label>
            <input id="tmdb" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-secondary">
            {token.trim() ? 'Save key' : 'Remove key'}
          </button>
        </form>
        <p className="tiny muted">
          The key stays in this browser only and is left out of backups. If TMDB can&rsquo;t be reached, club covers are shown. This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      </section>

      <section className="panel stack" aria-labelledby="backup-h">
        <h2 id="backup-h">Backup and restore</h2>
        <p className="small">
          Your statuses, reactions, notes and shelves are saved in <strong>this browser on this device</strong>. They don&rsquo;t sync to other devices. To move your collection, export a backup here and import it in the other browser.
        </p>
        <p className="small muted">
          Currently saved: {counts.personal} films with personal details, {counts.shelves} shelves, {counts.added} films you added, {counts.plans} double-bill plans.
          {!health.ok && ' Saving is not working right now, so export a backup to keep your changes.'}
        </p>
        <div className="row-wrap">
          <button type="button" className="btn btn-primary" onClick={() => { downloadText(`taryns-movie-club-backup-${stamp()}.json`, exportBackup(state), 'application/json'); announce('Backup downloaded.'); }}>
            Export backup (JSON)
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => { downloadText(`taryns-movie-club-watchlist-${stamp()}.csv`, toCsv(state), 'text/csv'); announce('Watchlist CSV downloaded.'); }}>
            Export watchlist (CSV)
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
            Import a backup
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
        {importError && (
          <p className="banner" role="alert">
            {importError}
          </p>
        )}
        <p className="tiny muted">The CSV opens in Excel or Google Sheets. Only JSON backups can be imported back.</p>
      </section>

      <section className="panel stack" aria-labelledby="reset-h">
        <h2 id="reset-h">Start again</h2>
        <p className="small">Clears your statuses, notes, shelves and plans and returns to the starting collection. You can undo straight afterwards, but export a backup first to be safe.</p>
        <div>
          <button type="button" className="btn btn-danger" onClick={() => setResetOpen(true)}>
            Reset my collection
          </button>
        </div>
      </section>

      <p className="tiny muted" style={{ marginTop: 16 }}>
        {films.length} films in the catalogue. Suggestions use transparent rules based on your choices and favourites; no AI service runs in this app.
      </p>

      <Dialog
        open={!!preview}
        onClose={() => setPreview(null)}
        title="Check this import"
        wide
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setPreview(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (!preview) return;
                commit((s) => applyImport(s, preview, opts), 'Backup imported.');
                setPreview(null);
              }}
            >
              Import
            </button>
          </>
        }
      >
        {preview && (
          <>
            <p className="small">
              {preview.exportedAt ? `Exported ${new Date(preview.exportedAt).toLocaleString('en-AU')}. ` : ''}
              Contains {preview.counts.personal} films with personal details, {preview.counts.shelves} shelves, {preview.counts.customFilms} added films and {preview.counts.plans} plans.
            </p>
            {preview.warnings.length > 0 && (
              <div className="banner" role="note">
                <div>
                  <strong>Some records were skipped because they were incomplete:</strong>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {preview.warnings.slice(0, 6).map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                    {preview.warnings.length > 6 && <li>and {preview.warnings.length - 6} more</li>}
                  </ul>
                </div>
              </div>
            )}
            {preview.duplicates.length > 0 && (
              <p className="small">
                <strong>{preview.duplicates.length} added {preview.duplicates.length === 1 ? 'film matches' : 'films match'} films you already have</strong> (same title and year). They will be merged, not duplicated:{' '}
                {preview.duplicates.map((d) => `${d.title} (${d.year})`).join(', ')}.
              </p>
            )}
            {preview.newFilms > 0 && <p className="small">{preview.newFilms} new added {preview.newFilms === 1 ? 'film' : 'films'} will join your collection.</p>}
            {preview.conflicts.length > 0 ? (
              <>
                <p className="small">
                  <strong>{preview.conflicts.length} {preview.conflicts.length === 1 ? 'film has' : 'films have'} different details in each collection.</strong>
                </p>
                <RadioGroup<ImportOptions['conflicts']>
                  legend="Status, reaction and flags"
                  name="imp-conflicts"
                  value={opts.conflicts}
                  options={[
                    { value: 'keep-mine', label: 'Keep what’s here (recommended)' },
                    { value: 'use-imported', label: 'Use the imported version' },
                  ]}
                  onChange={(v) => setOpts({ ...opts, conflicts: v })}
                />
                <RadioGroup<ImportOptions['notes']>
                  legend="Notes that differ"
                  name="imp-notes"
                  value={opts.notes}
                  options={[
                    { value: 'keep-mine', label: 'Keep my notes (recommended)' },
                    { value: 'combine', label: 'Keep both' },
                    { value: 'use-imported', label: 'Use imported notes' },
                  ]}
                  onChange={(v) => setOpts({ ...opts, notes: v })}
                />
                <details className="sources">
                  <summary>See the {preview.conflicts.length} differences</summary>
                  <ul>
                    {preview.conflicts.slice(0, 40).map((c) => (
                      <li key={c.id}>
                        {c.title}: here {c.mine.status}/{c.mine.reaction}, import {c.theirs.status}/{c.theirs.reaction}
                        {c.notesDiffer ? ' · notes differ' : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            ) : (
              <p className="small">No conflicts. Nothing you already have will change.</p>
            )}
            <p className="tiny muted">Empty notes here are filled from the import. Existing notes are never erased unless you choose to replace them. You can undo the import afterwards.</p>
          </>
        )}
      </Dialog>

      <Dialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset your collection?"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setResetOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                commit((s) => ({ ...freshState(), prefs: { ...freshState().prefs, tmdbToken: s.prefs.tmdbToken } }), 'Collection reset.');
                setResetOpen(false);
              }}
            >
              Reset
            </button>
          </>
        }
      >
        <p>This clears all your personal details. You can undo it straight away from the confirmation message.</p>
      </Dialog>
    </div>
  );
}
