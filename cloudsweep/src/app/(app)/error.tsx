"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <h1 className="text-[22px] font-semibold">Something went wrong</h1>
      <p className="mt-2 text-[14px] text-ink-muted">{error.message || "An unexpected error occurred."} Your files are safe — CloudSweep never changes anything without your confirmation.</p>
      <button onClick={reset} className="mt-6 rounded-xl bg-ink px-4 py-2.5 text-[14px] font-medium text-white">Try again</button>
    </div>
  );
}
