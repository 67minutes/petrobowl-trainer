import { ProgressBar } from "@/components/progress-bar";
import type { DashboardPlayerRow } from "@/types/dashboard";

export function PlayerTable({ players }: { players: DashboardPlayerRow[] }) {
  return (
    <div className="overflow-hidden rounded border border-ink-200 bg-white">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-ink-100 text-xs uppercase tracking-[0.12em] text-ink-500">
          <tr>
            <th className="px-4 py-3 font-semibold">Player</th>
            <th className="px-4 py-3 font-semibold">Assigned</th>
            <th className="px-4 py-3 font-semibold">Mastery</th>
            <th className="px-4 py-3 font-semibold">Due</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => {
            const mastery =
              player.assignedQuestions === 0
                ? 0
                : (player.mastered / player.assignedQuestions) * 100;
            return (
              <tr key={player.name} className="border-t border-ink-200">
                <td className="px-4 py-4">
                  <p className="font-medium text-ink-900">{player.name}</p>
                  <p className="mt-1 text-xs text-ink-500">{player.topicCount} topics</p>
                </td>
                <td className="px-4 py-4 text-ink-700">{player.assignedQuestions.toLocaleString()}</td>
                <td className="min-w-44 px-4 py-4">
                  <ProgressBar value={mastery} label={`${player.mastered.toLocaleString()} mastered`} />
                </td>
                <td className="px-4 py-4 text-ink-700">{player.dueToday}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
