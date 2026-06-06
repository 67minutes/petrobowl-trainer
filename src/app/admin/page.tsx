import { AuthGreeting } from "@/components/auth/auth-greeting";
import { RequireAuth } from "@/components/auth/require-auth";
import { AppShell } from "@/components/app-shell";
import { ImportPanel } from "@/components/import-panel";
import { SEED_PLAYERS, UNOWNED_TOPICS } from "@/lib/constants";

export default function AdminPage() {
  return (
    <AppShell
      active="/admin"
      eyebrow="Hello"
      title={<AuthGreeting />}
    >
      <RequireAuth adminOnly>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <ImportPanel />

          <section className="rounded border border-ink-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-ink-900">Assignments</h2>
            <div className="mt-4 divide-y divide-ink-200">
              {SEED_PLAYERS.map((player) => (
                <div key={player.name} className="py-3">
                  <p className="text-sm font-semibold text-ink-900">{player.name}</p>
                  <p className="mt-1 text-xs leading-5 text-ink-500">{player.topics.join(", ")}</p>
                </div>
              ))}
              <div className="py-3">
                <p className="text-sm font-semibold text-ink-900">Unowned</p>
                <p className="mt-1 text-xs leading-5 text-ink-500">{UNOWNED_TOPICS.join(", ")}</p>
              </div>
            </div>
          </section>
        </div>
      </RequireAuth>
    </AppShell>
  );
}
