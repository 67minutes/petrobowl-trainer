import { AuthGreeting } from "@/components/auth/auth-greeting";
import { RequireAuth } from "@/components/auth/require-auth";
import { AppShell } from "@/components/app-shell";
import { ProgressBar } from "@/components/progress-bar";
import { demoScores } from "@/lib/demo-data";

const topicRows = [
  { topic: "Well Test", owner: "Steven", hitRate: 72 },
  { topic: "Production", owner: "Anggitya", hitRate: 66 },
  { topic: "Reservoir Characterization", owner: "Maulidan", hitRate: 58 },
  { topic: "Drilling", owner: "Jak", hitRate: 74 }
];

export default function AnalyticsPage() {
  return (
    <AppShell
      active="/analytics"
      eyebrow="Hello"
      title={<AuthGreeting fallback="Hi, team." />}
    >
      <RequireAuth>
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded border border-ink-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-ink-900">Latest session scores</h2>
            <div className="mt-4 divide-y divide-ink-200">
              {demoScores.map((score) => (
                <div key={score.playerId} className="py-4">
                  <div className="mb-3 flex items-center justify-between gap-4">
                    <p className="font-medium text-ink-900">{score.name}</p>
                    <p className="text-xl font-semibold text-ink-900">{score.totalScore}</p>
                  </div>
                  <ProgressBar value={Math.max(0, score.totalScore)} label="Total score" />
                </div>
              ))}
            </div>
          </section>

          <section className="surface rounded p-5">
            <h2 className="text-lg font-semibold text-ink-900">Topic hit rate</h2>
            <div className="mt-4 space-y-5">
              {topicRows.map((row) => (
                <ProgressBar key={row.topic} value={row.hitRate} label={`${row.topic} - ${row.owner}`} />
              ))}
            </div>
          </section>
        </div>
      </RequireAuth>
    </AppShell>
  );
}
