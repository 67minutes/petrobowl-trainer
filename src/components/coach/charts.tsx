"use client";

import { clsx } from "clsx";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { CoachPlayer, CoachTopic, QuadrantLabel } from "@/types/coach";

const LABEL_STYLES: Record<QuadrantLabel, string> = {
  anchor: "bg-petrol-400/20 text-petrol-600",
  stealer: "bg-signal-500/15 text-signal-600",
  liability: "bg-red-100 text-red-600",
  balanced: "bg-ink-100 text-ink-600"
};

function formatSeconds(milliseconds: number) {
  if (!milliseconds) {
    return "0s";
  }
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

/** Red (low) → amber → green (high) shade for a 0-100 strength value. */
function strengthColor(value: number) {
  const hue = Math.round((Math.max(0, Math.min(100, value)) / 100) * 130);
  return `hsl(${hue} 70% 45%)`;
}

export function QuadrantBadge({ label }: { label: QuadrantLabel }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold capitalize",
        LABEL_STYLES[label]
      )}
    >
      {label}
    </span>
  );
}

function TrendArrow({ trend }: { trend: CoachPlayer["readiness"]["accuracyTrend"] }) {
  if (trend === "up") {
    return <ArrowUp aria-label="improving" className="h-4 w-4 text-petrol-600" />;
  }
  if (trend === "down") {
    return <ArrowDown aria-label="declining" className="h-4 w-4 text-signal-600" />;
  }
  return <Minus aria-label="flat" className="h-4 w-4 text-ink-400" />;
}

export function TopicStrengthMatrix({
  players,
  topics
}: {
  players: CoachPlayer[];
  topics: CoachTopic[];
}) {
  if (!players.length || !topics.length) {
    return <p className="text-sm text-ink-500">No topic data yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white px-2 pb-2 text-left align-bottom text-xs font-semibold text-ink-500">
              Player
            </th>
            {topics.map((topic) => (
              <th key={topic.id} className="px-1 pb-2 align-bottom">
                <span
                  title={topic.name}
                  className="mx-auto block h-24 w-5 truncate text-left text-xs text-ink-500 [writing-mode:vertical-rl]"
                >
                  {topic.name}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((player) => {
            const cellByTopic = new Map(player.topicStrength.map((cell) => [cell.topicId, cell]));
            return (
              <tr key={player.id}>
                <td className="sticky left-0 z-10 bg-white py-1 pr-3 text-sm font-medium text-ink-900">
                  {player.name}
                </td>
                {topics.map((topic) => {
                  const cell = cellByTopic.get(topic.id);
                  if (!cell || (cell.studySamples === 0 && cell.buzzSamples === 0)) {
                    return (
                      <td key={topic.id} className="p-0.5">
                        <div className="grid h-9 w-9 place-items-center rounded bg-ink-100 text-[10px] text-ink-300">
                          –
                        </div>
                      </td>
                    );
                  }
                  return (
                    <td key={topic.id} className="p-0.5">
                      <div
                        title={`${player.name} · ${topic.name}\nBlended ${cell.blended}% — study ${cell.studyAccuracy}% (${cell.studySamples}), buzz ${cell.buzzAccuracy}% (${cell.buzzSamples})${
                          cell.thinData ? "\nThin data — interpret with caution" : ""
                        }`}
                        className={clsx(
                          "relative grid h-9 w-9 place-items-center rounded text-[11px] font-semibold text-white",
                          cell.thinData && "opacity-40"
                        )}
                        style={{ backgroundColor: strengthColor(cell.blended) }}
                      >
                        {cell.blended}
                        {cell.owned ? (
                          <span className="absolute right-0.5 top-0.5 text-[8px] leading-none text-white/90">⬦</span>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-ink-500">
        Cell = blended strength (study + live buzz). ⬦ marks the topic owner. Faded cells have thin data
        (&lt; 3 samples) — interpret with caution.
      </p>
    </div>
  );
}

export function TopicStrengthList({ player, topics }: { player: CoachPlayer; topics: CoachTopic[] }) {
  const topicNameById = new Map(topics.map((topic) => [topic.id, topic.name]));
  const ranked = [...player.topicStrength]
    .filter((cell) => cell.studySamples > 0 || cell.buzzSamples > 0)
    .sort((left, right) => right.blended - left.blended);

  if (!ranked.length) {
    return <p className="text-sm text-ink-500">Drill a few topics to populate your strength profile.</p>;
  }

  return (
    <div className="space-y-3">
      {ranked.map((cell) => (
        <div key={cell.topicId}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-1 truncate text-ink-900">
              {cell.owned ? <span className="text-petrol-600">⬦</span> : null}
              <span className="truncate">{topicNameById.get(cell.topicId) ?? "Topic"}</span>
            </span>
            <span className={clsx("font-semibold", cell.thinData ? "text-ink-400" : "text-ink-900")}>
              {cell.blended}%
            </span>
          </div>
          <div className="h-2 rounded bg-ink-200">
            <div
              className={clsx("h-2 rounded", cell.thinData && "opacity-40")}
              style={{ width: `${Math.max(4, cell.blended)}%`, backgroundColor: strengthColor(cell.blended) }}
              title={`study ${cell.studyAccuracy}% (${cell.studySamples}), buzz ${cell.buzzAccuracy}% (${cell.buzzSamples})`}
            />
          </div>
        </div>
      ))}
      <p className="text-xs text-ink-500">⬦ marks topics you own. Faded bars have thin data (&lt; 3 samples).</p>
    </div>
  );
}

export function OffenseDefenseQuadrant({ players }: { players: CoachPlayer[] }) {
  const points = players.filter((player) => player.offenseDefense.otherQuestions + player.offenseDefense.ownQuestions > 0);

  if (!points.length) {
    return <p className="text-sm text-ink-500">No completed sessions yet to chart offense vs defense.</p>;
  }

  const offenses = points.map((player) => player.offenseDefense.offenseBonus);
  const defenses = points.map((player) => player.offenseDefense.defenseScore);
  const offMin = Math.min(-10, ...offenses);
  const offMax = Math.max(10, ...offenses);
  const defMin = Math.min(0, ...defenses);
  const defMax = Math.max(100, ...defenses);

  const xPct = (value: number) => ((value - offMin) / (offMax - offMin || 1)) * 100;
  const yPct = (value: number) => ((value - defMin) / (defMax - defMin || 1)) * 100;

  return (
    <div>
      <div className="relative aspect-square w-full rounded border border-ink-200 bg-ink-50">
        {/* mid lines: defense 50, offense 0 */}
        <div className="absolute left-0 right-0 border-t border-dashed border-ink-200" style={{ top: `${100 - yPct(50)}%` }} />
        <div className="absolute bottom-0 top-0 border-l border-dashed border-ink-200" style={{ left: `${xPct(0)}%` }} />
        <span className="absolute left-2 top-2 text-[10px] uppercase tracking-wide text-ink-400">Anchors</span>
        <span className="absolute right-2 top-2 text-[10px] uppercase tracking-wide text-ink-400">Stealers</span>
        <span className="absolute bottom-2 left-2 text-[10px] uppercase tracking-wide text-ink-400">Passive</span>
        <span className="absolute bottom-2 right-2 text-[10px] uppercase tracking-wide text-ink-400">Risky</span>

        {points.map((player) => {
          const { offenseBonus, defenseScore, label } = player.offenseDefense;
          return (
            <div
              key={player.id}
              className="absolute -translate-x-1/2 translate-y-1/2"
              style={{ left: `${xPct(offenseBonus)}%`, bottom: `${yPct(defenseScore)}%` }}
            >
              <div
                title={`${player.name}: defense ${defenseScore}, offense ${offenseBonus} (${label})`}
                className={clsx(
                  "h-3 w-3 rounded-full ring-2 ring-white",
                  label === "liability" ? "bg-red-500" : label === "anchor" ? "bg-petrol-500" : "bg-signal-500"
                )}
              />
              <span className="mt-0.5 block -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-ink-700">
                {player.name}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-xs text-ink-500">
        <span>← weaker offense</span>
        <span>stronger offense →</span>
      </div>
      <p className="mt-1 text-center text-xs text-ink-500">Vertical axis: defense (own-topic reliability)</p>
    </div>
  );
}

export function ReadinessBars({ players }: { players: CoachPlayer[] }) {
  const sorted = [...players].sort((left, right) => left.readiness.masteryPct - right.readiness.masteryPct);

  return (
    <div className="space-y-4">
      {sorted.map((player) => {
        const { masteryPct, mastered, assignedQuestions, dueBacklog, consistencyDays, accuracyTrend } =
          player.readiness;
        return (
          <div key={player.id}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-ink-900">{player.name}</span>
              <span className="flex items-center gap-2 text-ink-500">
                <span className="font-semibold text-ink-900">{masteryPct}%</span>
                <TrendArrow trend={accuracyTrend} />
              </span>
            </div>
            <div className="h-2 rounded bg-ink-200">
              <div
                className="h-2 rounded bg-petrol-500"
                style={{ width: `${Math.max(masteryPct ? 4 : 0, masteryPct)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-ink-500">
              {mastered}/{assignedQuestions} mastered · {dueBacklog} due · {consistencyDays}/7 active days
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function SpeedProfiles({ players }: { players: CoachPlayer[] }) {
  const withSpeed = players.filter((player) => player.speed.samples > 0);

  if (!withSpeed.length) {
    return <p className="text-sm text-ink-500">No drill response times recorded yet.</p>;
  }

  const maxMs = Math.max(1, ...withSpeed.map((player) => player.speed.maxMs));

  return (
    <div className="space-y-4">
      {withSpeed.map((player) => {
        const { minMs, medianMs, maxMs: playerMax, samples } = player.speed;
        const left = (minMs / maxMs) * 100;
        const width = Math.max(2, ((playerMax - minMs) / maxMs) * 100);
        const medianLeft = (medianMs / maxMs) * 100;
        return (
          <div key={player.id}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-ink-900">{player.name}</span>
              <span className="text-ink-500">median {formatSeconds(medianMs)}</span>
            </div>
            <div className="relative h-3 rounded bg-ink-100">
              <div
                className="absolute top-0 h-3 rounded bg-petrol-300"
                style={{ left: `${left}%`, width: `${width}%` }}
                title={`min ${formatSeconds(minMs)} – max ${formatSeconds(playerMax)}`}
              />
              <div
                className="absolute top-[-2px] h-[16px] w-0.5 bg-ink-900"
                style={{ left: `${medianLeft}%` }}
                title={`median ${formatSeconds(medianMs)}`}
              />
            </div>
            <p className="mt-1 text-xs text-ink-500">
              {formatSeconds(minMs)} – {formatSeconds(playerMax)} over {samples} drills
            </p>
          </div>
        );
      })}
    </div>
  );
}
