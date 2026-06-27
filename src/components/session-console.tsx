"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Play, RefreshCw, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import type { SessionTopicMode } from "@/lib/session-pool";
import type { SessionSetupData, SessionSetupTopic } from "@/types/session";

type MetadataResponse = {
  data?: SessionSetupData;
  error?: string;
};

type StartResponse = {
  sessionId?: string;
  error?: string;
};

const MODE_OPTIONS: { value: SessionTopicMode; label: string }[] = [
  { value: "topics", label: "Topics" },
  { value: "playerAssigned", label: "Assigned" },
  { value: "playerAssignedPlus", label: "Assigned + Extra" }
];

function toggleId(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}

function groupTopicsByOwner(topics: SessionSetupTopic[]) {
  const groups = new Map<string, { ownerName: string; topics: SessionSetupTopic[] }>();

  for (const topic of topics) {
    const key = topic.ownerId ?? "unowned";
    const current = groups.get(key) ?? { ownerName: topic.ownerName ?? "Unowned", topics: [] };
    current.topics.push(topic);
    groups.set(key, current);
  }

  return [...groups.entries()].map(([ownerId, group]) => ({ ownerId, ...group }));
}

export function SessionConsole() {
  const router = useRouter();
  const { session } = useAuth();
  const [data, setData] = useState<SessionSetupData | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [name, setName] = useState("");
  const [numQuestions, setNumQuestions] = useState(20);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [topicMode, setTopicMode] = useState<SessionTopicMode>("playerAssigned");
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMetadata = useCallback(async () => {
    const token = session?.access_token;

    if (!token) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/session/metadata", {
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = (await response.json()) as MetadataResponse;

      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? "Session setup unavailable.");
      }

      setData(payload.data);
    } catch (metadataError) {
      setError(metadataError instanceof Error ? metadataError.message : "Session setup unavailable.");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void loadMetadata();
  }, [loadMetadata]);

  useEffect(() => {
    if (!data || initialized) {
      return;
    }

    setParticipantIds(data.players.map((player) => player.id));
    setInitialized(true);
  }, [data, initialized]);

  const preview = useMemo(() => {
    const participantSet = new Set(participantIds);
    const assignedTopicIds = new Set(
      (data?.topics ?? [])
        .filter((topic) => topic.ownerId && participantSet.has(topic.ownerId))
        .map((topic) => topic.id)
    );
    const topicIds =
      topicMode === "topics"
        ? new Set(selectedTopicIds)
        : topicMode === "playerAssigned"
          ? assignedTopicIds
          : new Set([...assignedTopicIds, ...selectedTopicIds]);
    const topics = (data?.topics ?? []).filter((topic) => topicIds.has(topic.id));
    const balance = new Map<string, number>();

    for (const topic of topics) {
      const label = topic.ownerId && participantSet.has(topic.ownerId) ? topic.ownerName ?? "Player" : "Extra";
      balance.set(label, (balance.get(label) ?? 0) + topic.questionCount);
    }

    return {
      topics,
      topicCount: topics.length,
      availableQuestions: topics.reduce((sum, topic) => sum + topic.questionCount, 0),
      balance: [...balance.entries()].sort((left, right) => right[1] - left[1])
    };
  }, [data?.topics, participantIds, selectedTopicIds, topicMode]);

  async function startSession() {
    const token = session?.access_token;

    if (!token) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/session/start", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: name.trim() || undefined,
          numQuestions,
          participantIds,
          topicMode,
          topicIds: selectedTopicIds
        })
      });
      const payload = (await response.json()) as StartResponse;

      if (!response.ok || !payload.sessionId) {
        throw new Error(payload.error ?? "Could not start session.");
      }

      router.push(`/session/${payload.sessionId}`);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Could not start session.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">Loading session setup</h2>
        <p className="mt-2 text-sm text-ink-500">Preparing players, topics, and active sessions.</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">Session setup unavailable</h2>
        <p className="mt-3 text-sm text-red-600">{error ?? "Could not load session setup."}</p>
      </div>
    );
  }

  const topicGroups = groupTopicsByOwner(data.topics);
  const requiresTopicPicker = topicMode === "topics" || topicMode === "playerAssignedPlus";
  const startDisabled =
    submitting ||
    participantIds.length === 0 ||
    preview.topicCount === 0 ||
    numQuestions < 1 ||
    numQuestions > preview.availableQuestions;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <section className="surface rounded p-5">
          <div className="flex flex-col justify-between gap-3 border-b border-ink-200 pb-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-semibold text-ink-900">New buzzer session</h2>
              <p className="mt-1 text-sm text-ink-500">Choose the roster and question pool.</p>
            </div>
            <button
              type="button"
              onClick={() => void loadMetadata()}
              className="focus-ring inline-flex items-center justify-center gap-2 rounded border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 transition hover:border-ink-300"
            >
              <RefreshCw aria-hidden className="h-4 w-4" />
              Refresh
            </button>
          </div>

          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(280px,1.1fr)]">
            <div className="space-y-4">
              <label className="block text-sm font-medium text-ink-900" htmlFor="session-name">
                Session name
              </label>
              <input
                id="session-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Tonight scrimmage"
                className="focus-ring w-full rounded border border-ink-200 bg-white px-3 py-2 text-sm"
              />

              <label className="block text-sm font-medium text-ink-900" htmlFor="session-size">
                Questions
              </label>
              <input
                id="session-size"
                type="number"
                min={1}
                max={100}
                value={numQuestions}
                onChange={(event) => setNumQuestions(Number(event.target.value))}
                className="focus-ring w-full rounded border border-ink-200 bg-white px-3 py-2 text-sm"
              />

              <div>
                <p className="text-sm font-medium text-ink-900">Question mode</p>
                <div className="mt-2 grid grid-cols-3 rounded border border-ink-200 bg-white p-1">
                  {MODE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setTopicMode(option.value)}
                      className={`focus-ring rounded px-2 py-2 text-xs font-medium transition ${
                        topicMode === option.value ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-50"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                disabled={startDisabled}
                onClick={() => void startSession()}
                className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded bg-ink-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Play aria-hidden className="h-4 w-4" />
                Start
              </button>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <Users aria-hidden className="h-5 w-5 text-petrol-600" />
                <p className="text-sm font-medium text-ink-900">Participants</p>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {data.players.map((player) => {
                  const selected = participantIds.includes(player.id);

                  return (
                    <button
                      key={player.id}
                      type="button"
                      onClick={() => setParticipantIds((current) => toggleId(current, player.id))}
                      className={`focus-ring flex items-center justify-between gap-3 rounded border px-3 py-2 text-left text-sm transition ${
                        selected
                          ? "border-petrol-500 bg-petrol-400/15 text-ink-900"
                          : "border-ink-200 bg-white text-ink-600 hover:border-ink-300"
                      }`}
                    >
                      <span>{player.name}</span>
                      {selected ? <Check aria-hidden className="h-4 w-4 text-petrol-600" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {requiresTopicPicker ? (
          <section className="rounded border border-ink-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-ink-900">Topics</h2>
            <div className="mt-4 space-y-5">
              {topicGroups.map((group) => (
                <div key={group.ownerId}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-500">
                    {group.ownerName}
                  </p>
                  <div className="grid gap-2 md:grid-cols-2">
                    {group.topics.map((topic) => {
                      const selected = selectedTopicIds.includes(topic.id);

                      return (
                        <button
                          key={topic.id}
                          type="button"
                          onClick={() => setSelectedTopicIds((current) => toggleId(current, topic.id))}
                          className={`focus-ring flex min-h-16 items-center justify-between gap-3 rounded border px-3 py-2 text-left transition ${
                            selected
                              ? "border-petrol-500 bg-petrol-400/15"
                              : "border-ink-200 bg-white hover:border-ink-300"
                          }`}
                        >
                          <span>
                            <span className="block text-sm font-medium text-ink-900">{topic.name}</span>
                            <span className="block text-xs text-ink-500">
                              {topic.questionCount.toLocaleString()} questions
                            </span>
                          </span>
                          {selected ? <Check aria-hidden className="h-4 w-4 shrink-0 text-petrol-600" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <aside className="space-y-5">
        <section className="rounded border border-ink-200 bg-white p-5">
          <h2 className="text-lg font-semibold text-ink-900">Pool preview</h2>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded bg-ink-50 p-3">
              <p className="text-xs text-ink-500">Players</p>
              <p className="mt-1 text-xl font-semibold text-ink-900">{participantIds.length}</p>
            </div>
            <div className="rounded bg-ink-50 p-3">
              <p className="text-xs text-ink-500">Topics</p>
              <p className="mt-1 text-xl font-semibold text-ink-900">{preview.topicCount}</p>
            </div>
            <div className="rounded bg-ink-50 p-3">
              <p className="text-xs text-ink-500">Qs</p>
              <p className="mt-1 text-xl font-semibold text-ink-900">{preview.availableQuestions}</p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {preview.balance.length ? (
              preview.balance.map(([label, count]) => (
                <div key={label} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-ink-600">{label}</span>
                  <span className="font-medium text-ink-900">{count.toLocaleString()}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-ink-500">No eligible questions.</p>
            )}
          </div>

          {numQuestions > preview.availableQuestions ? (
            <p className="mt-4 text-sm text-red-600">Question count exceeds the eligible pool.</p>
          ) : null}
        </section>

        <section className="rounded border border-ink-200 bg-white">
          <div className="border-b border-ink-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink-900">Draft and active sessions</h2>
          </div>
          <div className="divide-y divide-ink-200">
            {data.sessions.length ? (
              data.sessions.map((activeSession) => (
                <Link
                  key={activeSession.id}
                  href={`/session/${activeSession.id}`}
                  className="focus-ring flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-ink-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink-900">{activeSession.name}</span>
                    <span className="mt-1 block truncate text-xs text-ink-500">
                      {activeSession.participantNames.join(", ")} / {activeSession.numQuestions} questions
                    </span>
                  </span>
                  <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-ink-500" />
                </Link>
              ))
            ) : (
              <p className="px-4 py-3 text-sm text-ink-500">No open sessions.</p>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
