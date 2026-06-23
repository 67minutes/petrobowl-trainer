"use client";

import { useEffect, useState } from "react";
import { Crosshair, Gauge, Grid3x3, Timer } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import {
  OffenseDefenseQuadrant,
  QuadrantBadge,
  ReadinessBars,
  SpeedProfiles,
  TopicStrengthList,
  TopicStrengthMatrix
} from "@/components/coach/charts";
import type { CoachData, CoachPlayer } from "@/types/coach";

type CoachResponse = {
  data?: CoachData;
  error?: string;
};

function useCoachData() {
  const { session } = useAuth();
  const [data, setData] = useState<CoachData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const token = session?.access_token;

    async function loadCoach() {
      if (!token) {
        setData(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/coach", {
          headers: { Authorization: `Bearer ${token}` }
        });
        const payload = (await response.json()) as CoachResponse;

        if (!response.ok || !payload.data) {
          throw new Error(payload.error ?? "Coach analytics unavailable.");
        }

        if (mounted) {
          setData(payload.data);
        }
      } catch (fetchError) {
        if (mounted) {
          setError(fetchError instanceof Error ? fetchError.message : "Coach analytics unavailable.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadCoach();

    return () => {
      mounted = false;
    };
  }, [session?.access_token]);

  return { data, loading, error };
}

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children
}: {
  icon: typeof Gauge;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded border border-ink-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Icon aria-hidden className="h-5 w-5 text-signal-600" />
        <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
      </div>
      {subtitle ? <p className="mt-1 text-sm text-ink-500">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function PlayerCard({ player, topics }: { player: CoachPlayer; topics: CoachData["topics"] }) {
  const { offenseDefense: od, readiness, speed } = player;
  return (
    <div className="rounded border border-ink-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-ink-900">{player.name}</h3>
        <QuadrantBadge label={od.label} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded bg-ink-50 p-2">
          <p className="text-xs text-ink-500">Defense</p>
          <p className="text-lg font-semibold text-ink-900">{od.defenseScore}</p>
        </div>
        <div className="rounded bg-ink-50 p-2">
          <p className="text-xs text-ink-500">Offense</p>
          <p className="text-lg font-semibold text-ink-900">{od.offenseBonus}</p>
        </div>
        <div className="rounded bg-ink-50 p-2">
          <p className="text-xs text-ink-500">Readiness</p>
          <p className="text-lg font-semibold text-ink-900">{readiness.masteryPct}%</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-500">
        {od.onTopic} on-topic · {od.outOfTopic} steals · {od.wrongBuzzes} wrong buzzes · {readiness.dueBacklog} due ·{" "}
        {speed.samples > 0 ? `${(speed.medianMs / 1000).toFixed(1)}s median` : "no speed data"}
      </p>
      <div className="mt-4 border-t border-ink-200 pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">Topic strengths</p>
        <TopicStrengthList player={player} topics={topics} />
      </div>
    </div>
  );
}

const DATA_NOTE =
  "Speed reflects drill-recall time only (live buzz timing isn't recorded). Live buzz data is sparse, so thin-data topic cells are faded — lean on study signal there.";

export function CoachContent() {
  const { data, loading, error } = useCoachData();

  if (loading) {
    return (
      <div className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">Loading coach view</h2>
        <p className="mt-2 text-sm text-ink-500">Aggregating topic strength, offense/defense, readiness, and speed.</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">Coach view unavailable</h2>
        <p className="mt-3 text-sm text-red-600">{error ?? "Coach analytics unavailable."}</p>
      </div>
    );
  }

  if (!data.players.length) {
    return (
      <div className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">No profile to show</h2>
        <p className="mt-3 text-sm text-ink-500">No active-player profile is linked to your account.</p>
      </div>
    );
  }

  const isAdmin = data.viewer.role === "admin";

  return (
    <div className="space-y-6">
      <p className="rounded border border-ink-200 bg-ink-50 px-4 py-3 text-xs leading-5 text-ink-600">{DATA_NOTE}</p>

      {isAdmin ? (
        <>
          <SectionCard
            icon={Grid3x3}
            title="Topic strength matrix"
            subtitle="Blended study + live-buzz accuracy per player and topic. Use it to assign topics and spot backups."
          >
            <TopicStrengthMatrix players={data.players} topics={data.topics} />
          </SectionCard>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard
              icon={Crosshair}
              title="Offense vs defense"
              subtitle="Anchors hold their topics; stealers win others' questions; risky players over-buzz."
            >
              <OffenseDefenseQuadrant players={data.players} />
            </SectionCard>
            <SectionCard icon={Gauge} title="Training readiness" subtitle="Sorted by who needs the most work.">
              <ReadinessBars players={data.players} />
            </SectionCard>
          </div>

          <SectionCard icon={Timer} title="Speed profile" subtitle="Drill-recall response times (min–max, median marker).">
            <SpeedProfiles players={data.players} />
          </SectionCard>

          <div>
            <h2 className="mb-3 text-lg font-semibold text-ink-900">Per-player profiles</h2>
            <div className="grid gap-5 lg:grid-cols-2">
              {data.players.map((player) => (
                <PlayerCard key={player.id} player={player} topics={data.topics} />
              ))}
            </div>
          </div>
        </>
      ) : (
        <PlayerCard player={data.players[0]} topics={data.topics} />
      )}
    </div>
  );
}
