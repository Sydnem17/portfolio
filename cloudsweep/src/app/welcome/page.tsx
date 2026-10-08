import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

export const metadata: Metadata = {
  title: "CloudSweep — find duplicates and tidy every cloud drive",
  description:
    "CloudSweep connects OneDrive, Google Drive and Dropbox, finds duplicate files and photos across all of them, and safely consolidates your storage.",
  robots: { index: true, follow: true },
};

const FEATURES = [
  ["Find duplicates across every drive", "Identical files, renamed copies, resized photos and whole mirrored folders — with the size, location and space wasted for each."],
  ["Clean up safely", "Pick which copy to keep, or let Smart select tick only byte-identical extras. Removed files go to your provider's own trash, so they stay recoverable."],
  ["Consolidate into one home", "Move or copy files between Google Drive, OneDrive and Dropbox. Every copy is checked before the original is touched."],
  ["Organise photos", "Browse photos from all your drives by place, pet, event and scene."],
] as const;

const STEPS = [
  ["Connect", "Sign in to each storage account and grant access. You can revoke it at any time."],
  ["Review", "CloudSweep reads file names, sizes, dates and checksums to show what's duplicated and how much space it uses."],
  ["Decide", "Nothing changes until you confirm. Every action can be undone from the Staging bin."],
] as const;

export default function Welcome() {
  return (
    <main className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-8">
        <span className="flex items-center gap-2.5">
          <BrandMark size={40} />
          <span className="leading-tight">
            <span className="block text-[17px] font-semibold tracking-tight">CloudSweep</span>
            <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">by Harlem Hustle</span>
          </span>
        </span>
        <Link href="/login" className="rounded-xl bg-ink px-4 py-2 text-[14px] font-medium text-white hover:bg-black">
          Sign in
        </Link>
      </header>

      <section className="mx-auto max-w-5xl px-4 pb-16 pt-12 sm:px-8 sm:pt-20">
        <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-brand">Cloud storage, tidied</p>
        <h1 className="mt-3 max-w-3xl text-[36px] font-semibold leading-[1.1] tracking-tight sm:text-[52px]">
          Find duplicates and tidy every cloud drive, in one place.
        </h1>
        <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-ink-soft">
          CloudSweep connects your Google Drive, Microsoft OneDrive and Dropbox accounts, finds the files and photos you have stored more than
          once, and helps you consolidate everything safely — so you stop paying for the same file three times.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/login" className="rounded-xl bg-ink px-5 py-3 text-[15px] font-medium text-white hover:bg-black">
            Sign in to CloudSweep
          </Link>
          <Link href="/privacy" className="rounded-xl border border-line px-5 py-3 text-[15px] font-medium hover:bg-slate-50">
            How your data is handled
          </Link>
        </div>
      </section>

      <section className="border-y border-line bg-[#F7F8FA]">
        <div className="mx-auto grid max-w-5xl gap-4 px-4 py-14 sm:grid-cols-2 sm:px-8">
          {FEATURES.map(([t, b]) => (
            <div key={t} className="rounded-2xl border border-line bg-white p-6">
              <h2 className="text-[16px] font-semibold">{t}</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-8">
        <h2 className="text-[24px] font-semibold tracking-tight">How it works</h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-3">
          {STEPS.map(([t, b], i) => (
            <li key={t}>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-[13px] font-semibold text-white">{i + 1}</span>
              <h3 className="mt-3 text-[16px] font-semibold">{t}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">{b}</p>
            </li>
          ))}
        </ol>
        <div className="mt-12 rounded-2xl border border-line p-6">
          <h2 className="text-[16px] font-semibold">Why CloudSweep asks for access to your Google Drive</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-muted">
            To find duplicates, CloudSweep needs to see every file in your Drive, not only files it created. It uses that access to list file details,
            show thumbnails and previews, and — only when you confirm — move duplicates to your Drive trash or copy files you choose to consolidate.
            It never sells your data, shows ads, or uses your files to train AI models. Read the{" "}
            <Link href="/privacy" className="text-brand underline">
              privacy policy
            </Link>{" "}
            for full details.
          </p>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-[13px] text-ink-muted sm:px-8">
          <span>CloudSweep is a private tool; signing in requires the owner&apos;s password.</span>
          <Link href="/privacy" className="hover:text-ink">
            Privacy policy
          </Link>
        </div>
      </footer>
    </main>
  );
}
