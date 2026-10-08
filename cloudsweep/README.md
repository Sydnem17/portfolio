# CloudSweep

**One private website to see, de-duplicate, consolidate and organise everything across OneDrive, Google Drive (personal and work), Dropbox — and any storage you add later.**

It runs as a hosted site. Nothing to install, and it works from any device.

---

## What it does

| Area | What you get |
|---|---|
| **Overview** | Storage used per drive, what's taking up space (by type), biggest duplicate wins, largest files, likely junk (installers, Downloads/Temp leftovers). |
| **Duplicates** | Every copy of the same file across every drive, with size, location, drive and space wasted. Three confidence levels: **Identical** (matching checksums), **Needs check** (same name and size, no shared checksum type), **Look-alike** (same photo at a different size). Also finds **mirrored folders** (for example, an old backup that duplicates your camera roll). |
| **Review mode** | A dark, focused split screen. The copy being kept is on the left; the other copies are stacked on the right. Keyboard: `←/→` to move, `A` to remove the extras and go to the next set, `S` to skip, `Esc` to close. |
| **Smart select** | One click ticks every *identical* extra copy. The copy being kept, look-alikes and unverified matches are never ticked automatically. |
| **Staging bin** | Everything CloudSweep removes goes to each provider's own trash first. Restore any file in one click, or everything at once. Providers purge their trash on their own schedule (usually 30 days). |
| **Consolidate** | A three-step wizard: pick sources, then a destination, then review the plan. Skips files already in the destination, copies each unique file once, **verifies size and checksum**, and only then sends the original to the Staging bin. Checks free space before it starts. |
| **Library** | A multi-cloud folder tree, search across every drive at once, and a lightbox that previews photos, plays video and audio with seeking, and shows PDFs and text inline. |
| **Photos** | Category chips for **Places · Pets · People · Events · Scenes · Things**. Places shows an interactive cluster map. Pets and People show as circular bubbles. Collections open in a masonry grid. |
| **Command palette** | `⌘K` / `Ctrl+K` to jump to any page or run any tool. |

### How it stays safe
- **Metadata-first scanning.** Scans read names, sizes, dates and the provider's own checksums. File contents are only read to (a) verify a "Needs check" match, (b) make a thumbnail, (c) preview a file you open, or (d) copy during consolidation.
- **Never a hard delete.** Removal always uses the provider's recoverable trash/recycle bin.
- **Copy, verify, then remove.** In consolidation, a source file is only removed after the copy's size (and checksum, where the providers share one) matches.
- **Locked down.** The whole site sits behind a password. OAuth tokens are encrypted at rest (AES-256-GCM). OAuth sign-in is protected against CSRF.
- **Privacy-aware AI.** Photo analysis asks only *how many* people are in a photo, never who they are.

---

## How it's built

```
Browser ──► Next.js 14 (App Router) on Vercel/Netlify ──► Postgres (Neon / Supabase)
                     │
                     ├── Provider adapters: OneDrive (Graph) · Google Drive v3 · Dropbox v2 · Demo
                     ├── Dedupe engine (pure TypeScript, unit-tested)
                     ├── Resumable job engine: scan · verify · analyse · transfer · trash
                     └── Claude vision (optional) for pets / events / scenes / things
```

**Built for serverless hosting.** Long tasks (scanning 100,000 files, moving 50 GB) run as small **resumable steps**, each about 8 seconds, with a saved cursor. A browser tab with the site open drives the steps. `/api/cron` drives them when no one has the site open. Large files transfer in chunks, so a 4 GB video survives function time limits and redeploys.

**Adding a new storage service** = one file in `src/lib/providers/` implementing `StorageProvider` (list, thumbnail, download range, chunked upload, move, trash, restore), plus one line in `src/lib/providers/index.ts`. Every feature — duplicates, consolidation, photos, Staging bin — then works for it automatically.

### Duplicate detection, in plain English
1. **Group by exact size.** Two files of different sizes can't be identical, so this removes about 99% of comparisons for free.
2. **Match checksums the providers already have.** Google gives MD5/SHA-1/SHA-256. OneDrive Personal gives SHA-1/SHA-256/QuickXor. OneDrive for Business gives QuickXor only. Dropbox has its own content hash. If any type matches → **Identical**. If a shared type *differs* → the files are definitely different.
3. **Same size + same name, but no checksum type in common** (for example, Google vs OneDrive for Business) → **Needs check**. "Verify" downloads only these files (up to 150 MB each), hashes them, and discards the bytes.
4. **Look-alike photos**: a 64-bit perceptual fingerprint (dHash) of each thumbnail, compared with fast banded lookup. This catches resized, re-saved and "sent via WhatsApp" copies.
5. **Which copy to keep**: higher resolution (for look-alikes), your *primary* account, an original name (not "Copy of…" or "(1)"), an organised folder (not Downloads/Backup/Temp), the earliest copy, then the shallowest path. The reasons are shown on screen, and you can override with one click.

---

## Try it locally in 2 minutes (demo library, no cloud accounts)

```bash
cd cloudsweep
cp .env.example .env.local
# Set APP_PASSWORD, and APP_SECRET to 32+ random characters:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
npm install
npm run dev            # http://localhost:3100
```
Sign in, then click **Try the demo library**. This loads three simulated drives (OneDrive, Google Personal, Google Work) full of realistic duplicates, photos and clutter. With no `DATABASE_URL`, data goes to an embedded Postgres in `./.data`.

Tests: `npm test` (17 tests, including an end-to-end run: scan → verify → analyse → clean up → undo → consolidate).

---

## Put it online (recommended: Vercel + Neon, both have free tiers)

### 1. Database — Neon
1. Go to **neon.tech** → sign up → **Create project** (pick the region closest to you, e.g. Sydney `ap-southeast-2`).
2. On the project dashboard, copy the **connection string** (starts with `postgresql://`, ends with `?sslmode=require`).
   The schema is created automatically on first run.

### 2. Hosting — Vercel
1. **vercel.com** → **Add New… → Project** → import the `portfolio` GitHub repo.
2. Set **Root Directory** to `cloudsweep`. Framework preset: **Next.js**.
3. Under **Environment Variables**, add:

| Name | Value |
|---|---|
| `APP_URL` | Your site URL, e.g. `https://cloudsweep-yourname.vercel.app` (no trailing slash) |
| `APP_PASSWORD` | A long passphrase |
| `APP_SECRET` | 32+ random characters (see command above). **Changing it later means reconnecting your drives.** |
| `DATABASE_URL` | The Neon connection string |
| `CRON_SECRET` | Any random string (Vercel Cron sends it automatically) |
| `ANTHROPIC_API_KEY` | Optional — enables AI photo tagging |

4. **Deploy.** Then add the provider credentials below and **redeploy**.

> **Netlify** also works. Create a *new* site from the same repo with **Base directory** `cloudsweep`; the Next.js runtime is detected automatically. Raise the function timeout if your plan allows; CloudSweep's steps are sized to fit the default limits.

**Background processing:** `vercel.json` schedules `/api/cron` once a day (the Hobby-plan limit). For faster progress while you're away, add a free scheduler (for example **cron-job.org**) that calls `GET https://<your-site>/api/cron` every 5 minutes with the header `Authorization: Bearer <CRON_SECRET>`. Whenever the site is open, jobs run continuously anyway.

---

## Connect your storage

Use the redirect URI pattern `{APP_URL}/api/oauth/{provider}` exactly. Consoles change their layouts often, so the menu names below may move — the settings themselves are what matter.

### Google Drive (personal and work)
1. **console.cloud.google.com** → create a project (e.g. "CloudSweep").
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **APIs & Services → OAuth consent screen** (or "Google Auth Platform"): user type **External**. Add scopes `openid`, `email`, `profile`, `.../auth/drive`. Add your Gmail and work addresses as **test users**.
4. **Credentials → Create credentials → OAuth client ID** → **Web application**. Add the authorised redirect URI `https://<your-site>/api/oauth/google` (plus `http://localhost:3100/api/oauth/google` for local).
5. Copy the Client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

⚠️ **Things to know**
- While the consent screen is in **Testing**, Google expires refresh tokens after **7 days**, so you'll be asked to reconnect weekly. To stop this, set the publishing status to **In production**. The full `drive` scope is "restricted": an unverified app shows a warning screen but works for personal use (Google caps unverified apps at 100 users).
- **Work (Google Workspace) accounts:** your admin may block unapproved apps. If sign-in fails with an admin error, ask them to trust your OAuth client ID (Admin console → Security → API controls → App access control).
- **Google Photos:** since March 2025, Google's Photos API only lets apps read photos the app itself uploaded. Photos that live *only* in Google Photos (not in Drive) can't be scanned by any third-party app. Workaround: use **Google Takeout** to export them into Drive, then let CloudSweep de-duplicate them.

### OneDrive (personal and Microsoft 365 work/school)
1. **portal.azure.com** → **Microsoft Entra ID → App registrations → New registration**.
2. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**.
3. Redirect URI: platform **Web**, `https://<your-site>/api/oauth/onedrive`.
4. **Certificates & secrets → New client secret** → copy the **Value** (not the ID). Secrets expire (24 months max) — set a reminder.
5. **API permissions → Add → Microsoft Graph → Delegated**: `Files.ReadWrite.All`, `User.Read`, `offline_access`.
6. Put the **Application (client) ID** and secret in `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET`.

⚠️ Work tenants may need an admin to **grant consent**. Restoring from the Staging bin is automatic for OneDrive Personal; for work/school accounts, Microsoft only allows restore from the OneDrive recycle bin on the web (CloudSweep tells you when that applies).

### Dropbox (optional)
1. **dropbox.com/developers/apps** → **Create app** → **Scoped access** → **Full Dropbox**.
2. **Permissions**: `account_info.read`, `files.metadata.read`, `files.content.read`, `files.content.write` → Submit.
3. **Settings → Redirect URIs**: `https://<your-site>/api/oauth/dropbox`.
4. Copy the App key and secret into `DROPBOX_CLIENT_ID` and `DROPBOX_CLIENT_SECRET`.

Connect several accounts of the same service (e.g. personal **and** work Google) by clicking **Connect** again and choosing the other login. Accounts are auto-labelled Personal/Work by email domain; click a name to rename it.

### Folders and drives on your computer (local, USB, NAS)
Works in **Chrome or Edge on a computer** (Windows or Mac). Nothing to install.

1. **Storage accounts → This computer → Add local folder or drive**, then pick a folder (e.g. `Pictures`), a USB drive (e.g. `E:\`) or a mapped NAS drive.
   - **NAS:** first map it in Windows: **File Explorer → This PC → Map network drive**, choose a letter (e.g. `Z:`) and the NAS share. Then pick `Z:`.
2. Click **View files** / **Allow** when Chrome asks for permission. CloudSweep needs edit access so it can move duplicates into a staging folder.
3. Keep the tab open while it scans (the progress panel says so). It reads names, sizes and dates, then fingerprints only files that share a size with another file anywhere, using the same fingerprints Google and OneDrive use, so local files match cloud copies exactly.

**Safety:** local duplicates are **moved into a `CloudSweep Staging` folder on the same drive**, never deleted. Restore them from the Staging bin, or empty that folder yourself when you're happy. **Privacy:** file contents never leave your computer.

**Not yet:** copying local files up to the cloud in Consolidate, previews of local files, and look-alike matching for local photos.

---

## First clean-up: a recommended order

1. **Connect every drive**, then mark your long-term home as **Primary** (Storage accounts). Keepers prefer it.
2. Wait for the scans (bottom-right panel). They're metadata-only and fast.
3. **Duplicates → Verify likely matches.**
4. **Photos → Analyse** to find look-alikes and build Places, Pets and other collections.
5. **Duplicates → Smart select → Move to trash** for the identical copies. Then work through look-alikes in **Review mode**.
6. **Consolidate** what's left into your primary drive (start with **Copy only** if you want to build trust first).
7. Check the **Staging bin**, then let the providers empty their trash on schedule.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Sign-in expired" badge on a drive | Click **Reconnect**. Google *Testing*-mode tokens expire weekly (see above). |
| "did not grant offline access" | Remove CloudSweep from your account's connected apps (Google: myaccount.google.com → Security → Third-party access), then connect again. |
| `redirect_uri_mismatch` | The URI in the provider console must exactly equal `{APP_URL}/api/oauth/{provider}` — check `https`, the domain and that there's no trailing slash. |
| Jobs pause when I close the tab | Expected without a scheduler. Set up the 5-minute cron (above), or reopen the site. |
| Google Docs/Sheets skipped in consolidation | Native Google files have no downloadable bytes. Keep them in Google, or export them first. |
| HEIC/RAW photos show as thumbnails in the lightbox | Browsers can't decode them; CloudSweep falls back to the provider's JPEG thumbnail. |

---

## Roadmap (next phases)

1. **People recognition (opt-in).** On-device face embeddings + clustering, so you can name a person once and find them everywhere. This is off by default and needs an explicit consent step, because face data is biometric information under the Australian Privacy Act and GDPR.
2. **Incremental scans** using OneDrive delta links, Drive change tokens and the Dropbox cursor (only changes, every few minutes).
3. **More providers**: Box, iCloud Drive (via a sync bridge), pCloud, S3/Backblaze, Synology, WebDAV.
4. **Rules**: "Always keep the copy in OneDrive", "auto-stage WhatsApp duplicates older than 90 days", weekly digest email.
5. **Similar documents**: near-duplicate PDFs/Docs (v1 vs v1-final).
