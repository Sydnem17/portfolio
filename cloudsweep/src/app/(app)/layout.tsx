import { CommandPalette } from "@/components/CommandPalette";
import { JobDock } from "@/components/JobDock";
import { SetupChecklist } from "@/components/SetupChecklist";
import { Sidebar } from "@/components/Sidebar";
import { setupIssues } from "@/lib/setup";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const issues = await setupIssues();
  if (issues.length)
    return (
      <main className="min-h-screen px-4 sm:px-8">
        <SetupChecklist issues={issues} />
      </main>
    );
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
