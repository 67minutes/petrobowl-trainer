import { AppShell } from "@/components/app-shell";
import { DrillCard } from "@/components/drill-card";
import { StatRow } from "@/components/stat-row";

export default function DrillPage() {
  return (
    <AppShell
      active="/drill"
      eyebrow="Solo drill"
      title="Recall the term, reveal, then self-grade."
      subtitle="The SM-2 scheduler updates interval, ease factor, repetitions, and next review date after every card."
      aside={
        <div className="rounded border border-ink-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-ink-900">Queue rules</h2>
          <div className="mt-3">
            <StatRow label="Due reviews" value="44" detail="Served first" tone="warn" />
            <StatRow label="New cards" value="30" detail="Daily default cap" />
            <StatRow label="Mastered" value="612" detail="Interval >= 21 days" tone="good" />
          </div>
        </div>
      }
    >
      <DrillCard />
    </AppShell>
  );
}
