// End-to-end smoke test of the core journey, run against a built preview:
//   npm run build && npm run preview   (in one terminal)
//   npm run e2e                        (in another)
// Picks a film with the keyboard, follows a reference, updates personal state,
// reloads, exports a backup, resets, restores, and checks phone layout.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();

// First run: exactly two watched and loved.
const counts = await page.locator('.counts').innerText();
check('First run shows 136 films and 2 watched & loved', /136 films/.test(counts) && /2 watched/.test(counts), counts.replace(/\s+/g, ' '));

// 1. Pick a film using only the keyboard.
const cta = page.getByRole('button', { name: 'Pick tonight’s film' }).first();
await cta.focus();
await page.keyboard.press('Enter');
const dialog = page.getByRole('dialog');
check('Picker dialog opens from the keyboard', await dialog.isVisible());
check('Focus moves into the dialog', await page.evaluate(() => !!document.activeElement?.closest('dialog')));
await page.keyboard.press('Escape');
check('Escape closes the picker', !(await dialog.isVisible()));
check('Focus returns to the trigger', await page.evaluate(() => document.activeElement?.textContent?.includes('Pick tonight')));
await page.keyboard.press('Enter');
await dialog.getByRole('radio', { name: 'Music and nostalgia' }).check();
await dialog.getByRole('radio', { name: 'Under 2 hours' }).check();
await dialog.getByRole('button', { name: 'Show my three' }).click();
const picks = dialog.locator('article.pick');
const n = await picks.count();
check('Tonight’s three returns choices', n >= 2, `${n} choices`);
const runtimes = await dialog.locator('article.pick .small.muted').allInnerTexts();
check('Every pick fits under 2 hours with a known runtime', runtimes.every((t) => !/not verified/.test(t) && (() => { const m = t.match(/(\d) hr(?: (\d+) min)?|(\d+) min/); if (!m) return false; const mins = m[3] ? +m[3] : +m[1] * 60 + (+m[2] || 0); return mins <= 120; })()), runtimes.join(' | '));
const before = await picks.locator('h3').allInnerTexts();
await dialog.getByRole('button', { name: 'Different three' }).click();
const after = await picks.locator('h3').allInnerTexts();
check('Different three changes the suggestions', before.join() !== after.join(), `${before.join(', ')} -> ${after.join(', ')}`);
const discovery = dialog.locator('article.pick', { hasText: 'A new discovery' });
const chosenTitle = (await discovery.locator('h3').innerText()).trim();
await discovery.getByRole('button', { name: 'Choose this' }).click();
await page.waitForURL(/#\/film\//);
check('Choose this opens the film page', (await page.locator('h1').first().innerText()).includes(chosenTitle), chosenTitle);

// 2. Explore a music / reference connection.
await page.goto(`${BASE}#/connections/trails/pottery-wheel`);
await page.getByRole('button', { name: 'I recognise that' }).click();
await page.goto(`${BASE}#/film/ghost-1990`);
const ghostStatus = await page.locator('input[name="status-ghost-1990"]:checked').evaluate((el) => el.parentElement.innerText);
check('Recognising the reference leaves Ghost’s status unchanged', /Not yet known/.test(ghostStatus), ghostStatus);
await page.getByRole('button', { name: 'Follow this sound' }).first().click();
check('Follow this sound reveals the next step', await page.getByLabel('Follow this sound').first().isVisible());

// 3. Update personal state.
await page.getByRole('radio', { name: 'Want to watch' }).check();
await page.getByRole('radio', { name: 'Liked', exact: true }).check();
await page.getByRole('textbox', { name: 'Your notes' }).fill('Watch with a box of tissues');
await page.getByRole('textbox', { name: 'Your notes' }).blur();
await page.getByPlaceholder('New shelf').fill('Rainy Sunday');
await page.getByRole('button', { name: 'Add shelf' }).click();
await page.waitForTimeout(300);

// 4. Reload.
await page.reload();
const notes = await page.getByRole('textbox', { name: 'Your notes' }).inputValue();
const status = await page.locator('input[name="status-ghost-1990"]:checked').evaluate((el) => el.parentElement.innerText);
const reaction = await page.locator('input[name="reaction-ghost-1990"]:checked').evaluate((el) => el.parentElement.innerText);
const shelf = await page.getByRole('checkbox', { name: 'Rainy Sunday' }).isChecked();
check('Notes, status, reaction and shelf survive a reload', notes === 'Watch with a box of tissues' && /Want to watch/.test(status) && /Liked/.test(reaction) && shelf, `${status} / ${reaction} / shelf ${shelf}`);

// 5. Export, reset, restore.
await page.goto(`${BASE}#/settings`);
const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup (JSON)' }).click()]);
const backupPath = await download.path();
const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
check('Backup file is versioned JSON containing the note', backup.app === 'taryns-movie-club' && backup.schema === 1 && backup.state.films['ghost-1990'].notes === 'Watch with a box of tissues');
const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export watchlist (CSV)' }).click()]);
const csvText = readFileSync(await csv.path(), 'utf8');
check('CSV watchlist downloads with all films', csvText.split('\r\n').length === 137);

await page.getByRole('button', { name: 'Reset my collection' }).click();
await page.getByRole('dialog').getByRole('button', { name: 'Reset' }).click();
await page.goto(`${BASE}#/film/ghost-1990`);
check('Reset clears the note', (await page.getByRole('textbox', { name: 'Your notes' }).inputValue()) === '');
await page.goto(`${BASE}#/settings`);
await page.locator('input[type="file"]').setInputFiles(backupPath);
const importDialog = page.getByRole('dialog');
await importDialog.getByRole('heading', { name: 'Check this import' }).waitFor({ timeout: 5000 }).catch(() => {});
check('Import shows a preview first', await importDialog.getByRole('heading', { name: 'Check this import' }).isVisible());
await importDialog.getByRole('button', { name: 'Import' }).click();
await page.goto(`${BASE}#/film/ghost-1990`);
check('Restore brings the note back', (await page.getByRole('textbox', { name: 'Your notes' }).inputValue()) === 'Watch with a box of tissues');
await page.reload();
check('Restored data survives another reload', (await page.getByRole('textbox', { name: 'Your notes' }).inputValue()) === 'Watch with a box of tissues');

// Search and spoilers.
await page.goto(`${BASE}#/search?q=sex%20lies%20and%20videotapes`);
check('Punctuation-insensitive search finds sex, lies, and videotape', (await page.locator('.film-row a.film-link').first().innerText()) === 'sex, lies, and videotape');
await page.goto(`${BASE}#/film/the-empire-strikes-back-1980`);
check('Spoilers hidden on the film page by default', !(await page.content()).includes('No, I am your father'));

// Double bill ticket download.
await page.goto(`${BASE}#/connections/double-bills`);
await page.waitForTimeout(400);
const [ticket] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download ticket' }).click()]);
check('Ticket downloads as a PNG', ticket.suggestedFilename().endsWith('.png'), ticket.suggestedFilename());

// Phone layout.
const phone = await browser.newContext({ viewport: { width: 360, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const p2 = await phone.newPage();
let overflowPages = [];
for (const path of ['', '#/films', '#/film/muriels-wedding-1994', '#/connections', '#/connections/double-bills', '#/connections/spader', '#/connections/time-machine', '#/connections/mystery', '#/music', '#/settings']) {
  await p2.goto(BASE + path);
  await p2.waitForTimeout(250);
  const o = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (o > 0) overflowPages.push(`${path || 'home'} +${o}px`);
}
check('No horizontal overflow at 360px wide', overflowPages.length === 0, overflowPages.join(', '));
await p2.goto(BASE);
const nav = p2.locator('.bottom-nav');
check('Bottom navigation visible on phones', await nav.isVisible());
const tonightBtn = nav.getByRole('button', { name: 'Tonight' });
const box = await tonightBtn.boundingBox();
check('Tonight action sits in the thumb zone and is at least 44px tall', box && box.y > 760 - 90 && box.height >= 44, JSON.stringify(box));
await tonightBtn.tap();
check('Tonight opens from the bottom nav', await p2.getByRole('dialog').isVisible());

check('No script errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
