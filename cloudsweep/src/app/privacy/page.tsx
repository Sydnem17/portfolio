import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy policy · CloudSweep",
  description: "What CloudSweep accesses, stores and never does with your cloud storage.",
  robots: { index: true, follow: true },
};

const UPDATED = "8 October 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-[18px] font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

// Optional: set CONTACT_EMAIL to show a contact address on this public page.
const contact = process.env.CONTACT_EMAIL?.trim();

export default function Privacy() {
  return (
    <main className="min-h-screen bg-white px-4 py-12 sm:px-8">
      <article className="mx-auto max-w-2xl">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={28} height={28} />
          <span className="text-[16px] font-semibold tracking-tight">CloudSweep</span>
        </Link>
        <h1 className="mt-10 text-[32px] font-semibold tracking-tight">Privacy policy</h1>
        <p className="mt-2 text-[14px] text-ink-muted">Last updated {UPDATED}</p>

        <p className="mt-6 text-[15px] leading-relaxed text-ink-soft">
          CloudSweep (&ldquo;the app&rdquo;) helps its owner find duplicate files and organise their own cloud storage across Google Drive, Microsoft
          OneDrive and Dropbox. It is a private tool: signing in requires the owner&apos;s password, and the only storage accounts it accesses are
          ones the owner connects and approves. This policy explains what data the app accesses, how it is used, stored and shared, and how to
          remove it.
        </p>

        <Section title="1. Data the app accesses">
          <p>When you connect a storage account and grant permission, the app accesses:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><b>Account information:</b> your name, email address and storage quota (used and total), to label the account and show free space.</li>
            <li><b>File and folder metadata:</b> names, folder locations, sizes, file types, created and modified dates, and the checksums your provider calculates (for example MD5 or SHA-256). This is how duplicates are identified.</li>
            <li><b>Photo metadata</b> your provider supplies, such as the date a photo was taken, its dimensions and location.</li>
            <li><b>File contents, only for specific tasks:</b> to confirm two files are identical when metadata alone cannot, to generate thumbnails, to show a preview you open, and to copy a file you choose to move to another account.</li>
          </ul>
        </Section>

        <Section title="Folders and drives on your computer">
          <p>
            If you add a local folder, USB drive or mapped network drive, your browser reads it on your computer. Only file and folder names,
            sizes, dates and fingerprints (checksums) are sent to the app; <b>file contents never leave your computer</b>. When you remove a local
            duplicate, your browser moves it into a &ldquo;CloudSweep Staging&rdquo; folder on the same drive rather than deleting it.
          </p>
        </Section>

        <Section title="Photo tagging and places">
          <p>
            Free photo tagging (pets, people counts, scenes and things) runs on <b>your own device</b>: your browser downloads two open AI models
            from Google&rsquo;s public model store (storage.googleapis.com) once, then looks at CloudSweep&rsquo;s small thumbnails locally. Photos and
            thumbnails are not sent to any AI service. Only the resulting tags (for example &ldquo;dog: beagle&rdquo;, &ldquo;beach &amp; coast&rdquo;)
            are saved to your library. To find where a photo was taken when your drive doesn&rsquo;t report it, the app reads the first part of the
            photo file (its EXIF data) and keeps only the location and date.
          </p>
        </Section>

        <Section title="2. Google user data and permissions requested">
          <p>For Google Drive, the app requests these permissions:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><code className="rounded bg-slate-100 px-1">https://www.googleapis.com/auth/drive</code> — to list every file in your Drive so duplicates can be found, read file contents for the tasks listed above, move files you approve to your Drive trash, and create copies you request during consolidation. A narrower permission would only show files the app itself created, which would make duplicate detection impossible.</li>
            <li><code className="rounded bg-slate-100 px-1">openid</code>, <code className="rounded bg-slate-100 px-1">email</code>, <code className="rounded bg-slate-100 px-1">profile</code> — to identify which Google account is connected.</li>
          </ul>
          <p>
            The app&apos;s use and transfer of information received from Google APIs adheres to the{" "}
            <a className="text-brand underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements. Google user data is used only to provide the features you see in the app. It is not used for
            advertising, not sold, not used to train AI or machine-learning models, and not read by people except where you explicitly ask for help
            or where required by law.
          </p>
        </Section>

        <Section title="3. How the data is used">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>To find identical and similar files and photos across your connected accounts and show how much space they use.</li>
            <li>To suggest which copy to keep, and to carry out clean-ups and moves <b>only when you confirm them</b>.</li>
            <li>To group photos by place, pet, event and scene.</li>
            <li>To keep a log of actions so you can undo them.</li>
          </ul>
          <p>
            When you remove files, the app moves them to <b>your provider&apos;s own trash or recycle bin</b>, where they remain recoverable under that
            provider&apos;s rules (usually 30 days or more). The app never permanently deletes files.
          </p>
        </Section>

        <Section title="4. What is stored, and where">
          <ul className="list-disc space-y-1.5 pl-5">
            <li><b>An index of file metadata</b> (section 1) in a private PostgreSQL database. File contents are not stored; they are processed in memory and discarded.</li>
            <li><b>Sign-in tokens</b> for each connected account, encrypted with AES-256-GCM before they are saved.</li>
            <li><b>A log of actions</b> (for example, which files were moved to trash) so they can be undone.</li>
            <li><b>Photo labels</b> such as &ldquo;dog&rdquo; or &ldquo;beach&rdquo;, if photo analysis is used.</li>
          </ul>
        </Section>

        <Section title="5. Sharing and service providers">
          <p>The app does not sell or share your data with third parties for their own purposes. It relies on these service providers to run:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><b>Vercel</b> — hosts the website and runs the app.</li>
            <li><b>Neon</b> — hosts the private database holding the index described above.</li>
            <li><b>Anthropic (optional)</b> — if photo analysis is turned on, small photo thumbnails are sent to Anthropic&apos;s Claude API to label pets, scenes, events and objects. The app asks only <i>how many</i> people appear in a photo, never who they are, and does not perform face recognition.</li>
          </ul>
          <p>Data is sent to your storage providers (Google, Microsoft, Dropbox) only to carry out the actions described in this policy.</p>
        </Section>

        <Section title="6. Security">
          <p>
            All traffic uses HTTPS. The app is protected by a password, sign-in tokens are encrypted at rest, and sign-in with each provider uses
            OAuth 2.0 with protection against request forgery. Access is limited to the permissions listed in section 2.
          </p>
        </Section>

        <Section title="7. Retention and deletion">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>The index and tokens are kept while an account stays connected, and refreshed each time it is scanned.</li>
            <li><b>Disconnecting an account</b> in the app deletes its index and its stored sign-in tokens.</li>
            <li>You can also revoke access at any time from your{" "}
              <a className="text-brand underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">Google Account</a>,{" "}
              <a className="text-brand underline" href="https://account.live.com/consent/Manage" target="_blank" rel="noreferrer">Microsoft account</a> or{" "}
              <a className="text-brand underline" href="https://www.dropbox.com/account/connected_apps" target="_blank" rel="noreferrer">Dropbox account</a> settings.
            </li>
          </ul>
        </Section>

        <Section title="8. Children">
          <p>The app is not directed at children and is not intended for use by anyone under 16.</p>
        </Section>

        <Section title="9. Changes to this policy">
          <p>If this policy changes, the &ldquo;Last updated&rdquo; date above will change. Material changes will be reflected here before they take effect.</p>
        </Section>

        {contact && (
          <Section title="10. Contact">
            <p>
              Questions about this policy:{" "}
              <a className="text-brand underline" href={`mailto:${contact}`}>
                {contact}
              </a>
            </p>
          </Section>
        )}
      </article>
    </main>
  );
}
