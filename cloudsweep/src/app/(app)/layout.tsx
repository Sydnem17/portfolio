import { CommandPalette } from "@/components/CommandPalette";
import { JobDock } from "@/components/JobDock";
import { Sidebar } from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lg:flex">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 pb-32 pt-6 sm:px-8 lg:px-12 lg:pt-16">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      <JobDock />
      <CommandPalette />
    </div>
  );
}
