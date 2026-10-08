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
          CloudSweep is a private, password-protected tool its owner uses to find duplicate files and organise their own cloud storage. It is not a
          public service: only the owner can sign in. This page explains exactly what it accesses and why.
        </p>

        <Section title="What CloudSweep accesses">
          <p>When you connect a storage account (Google Drive, Microsoft OneDrive or Dropbox) and approve access, CloudSweep reads:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><b>File details</b> — names, folders, sizes, dates, file types and the checksums your provider already calculates. This is how duplicates are found.</li>
            <li><b>Photo details</b> your provider supplies, such as the date taken and location.</li>
            <li><b>File contents, only when needed</b> — to confirm a possible duplicate, make a thumbnail, preview a file you open, or copy a file you choose to move between accounts. Contents are processed in memory and not stored.</li>
            <li><b>Your account name, email and storage quota</b>, to label the account and show free space.</li>
          </ul>
        </Section>

        <Section title="What CloudSweep changes, and only when you ask">
          <p>
            Nothing in your storage is changed until you confirm an action. When you remove duplicates or consolidate files, CloudSweep moves the
            original to <b>your provider&apos;s own trash or recycle bin</b>, where it stays recoverable under that provider&apos;s rules (usually 30
            days or more). CloudSweep never permanently deletes files.
          </p>
        </Section>

        <Section title="What is stored">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>An index of file details (not file contents) in a private database, so results load quickly.</li>
            <li>Sign-in tokens for each connected account, <b>encrypted</b> (AES-256-GCM) before they are saved.</li>
            <li>A log of actions you take, so you can undo them.</li>
          </ul>
          <p>Disconnecting an account deletes its index from CloudSweep. You can also revoke access at any time from your Google, Microsoft or Dropbox account security settings.</p>
        </Section>

        <Section title="Photo analysis (optional)">
          <p>
            If enabled, small photo thumbnails are sent to Anthropic&apos;s Claude API to label pets, scenes, events and objects. CloudSweep asks only
            <i> how many</i> people appear in a photo — never who they are. It does not perform face recognition.
          </p>
        </Section>

        <Section title="What CloudSweep never does">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Sell, share or use your data for advertising.</li>
            <li>Use your data to train AI models.</li>
            <li>Give anyone else access to your files or index.</li>
          </ul>
        </Section>

        <Section title="Google API data">
          <p>
            CloudSweep&apos;s use and transfer of information received from Google APIs adheres to the{" "}
            <a className="text-brand underline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </Section>

        {contact && (
          <Section title="Contact">
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
