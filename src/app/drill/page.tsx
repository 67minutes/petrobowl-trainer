import { AppShell } from "@/components/app-shell";
import { DrillCard } from "@/components/drill-card";
import { StatRow } from "@/components/stat-row";

export default function DrillPage() {
  return (
    <AppShell
      active="/drill"
      eyebrow="Hello"
      title="Hi, Maulidan."
      aside={
        <div className="rounded border border-ink-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-ink-900">Queue</h2>
          <div className="mt-3">
            <StatRow label="Due reviews" value="44" tone="warn" />
            <StatRow label="New cards" value="30" />
            <StatRow label="Mastered" value="612" tone="good" />
          </div>
        </div>
      }
    >
      <DrillCard />
    </AppShell>
  );
}
