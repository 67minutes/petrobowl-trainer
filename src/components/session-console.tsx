"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Ban, CheckCircle2 } from "lucide-react";
import { demoPlayers } from "@/lib/demo-data";
import { calculateSessionScores, type ScoredSessionQuestion } from "@/lib/scoring";

const baseQuestions: ScoredSessionQuestion[] = [
  { id: "1", assignedTo: "player-1", buzzedBy: null, correct: true },
  { id: "2", assignedTo: "player-2", buzzedBy: null, correct: true },
  { id: "3", assignedTo: "player-3", buzzedBy: null, correct: true },
  { id: "4", assignedTo: "player-4", buzzedBy: null, correct: true },
  { id: "5", assignedTo: null, buzzedBy: null, correct: true }
];

export function SessionConsole() {
  const [cursor, setCursor] = useState(0);
  const [questions, setQuestions] = useState(baseQuestions);
  const current = questions[cursor];

  const scores = useMemo(() => calculateSessionScores(demoPlayers, questions), [questions]);

  function markBuzz(playerId: string | null) {
    setQuestions((items) =>
      items.map((question, index) =>
        index === cursor ? { ...question, buzzedBy: playerId, correct: Boolean(playerId) } : question
      )
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="surface rounded p-5">
        <div className="flex items-center justify-between gap-4 border-b border-ink-200 pb-4">
          <div>
            <p className="text-sm text-ink-500">
              Question {cursor + 1} of {questions.length}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-ink-900">Quizmaster console</h2>
          </div>
          <button
            type="button"
            onClick={() => setCursor((value) => Math.min(value + 1, questions.length - 1))}
            className="focus-ring inline-flex items-center gap-2 rounded bg-ink-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-ink-700"
          >
            Next
            <ArrowRight aria-hidden className="h-4 w-4" />
          </button>
        </div>

        <div className="py-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-petrol-600">
            Topic owner:{" "}
            {demoPlayers.find((player) => player.id === current.assignedTo)?.name ?? "Unowned pool"}
          </p>
          <p className="mt-3 text-2xl font-semibold leading-9 text-ink-900">
            A method used to increase oil recovery by injecting gas, chemicals, or heat after primary recovery.
          </p>
          <p className="mt-4 text-lg text-ink-600">Answer: Enhanced Oil Recovery</p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {demoPlayers.map((player) => (
            <button
              key={player.id}
              type="button"
              onClick={() => markBuzz(player.id)}
              className="focus-ring flex items-center justify-between rounded border border-ink-200 bg-white px-4 py-3 text-left transition hover:border-petrol-500 hover:text-petrol-600"
            >
              <span className="font-medium">{player.name}</span>
              <CheckCircle2 aria-hidden className="h-4 w-4" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => markBuzz(null)}
            className="focus-ring flex items-center justify-between rounded border border-ink-200 bg-white px-4 py-3 text-left text-signal-600 transition hover:border-signal-500"
          >
            <span className="font-medium">No Buzz</span>
            <Ban aria-hidden className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="rounded border border-ink-200 bg-white">
        <div className="border-b border-ink-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-ink-900">Live scores</h3>
        </div>
        <div className="divide-y divide-ink-200">
          {scores.map((score) => (
            <div key={score.playerId} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-ink-900">{score.name}</p>
                <p className="text-xs text-ink-500">
                  D {score.defenseScore} / O {score.offenseBonus}
                </p>
              </div>
              <p className="text-xl font-semibold text-ink-900">{score.totalScore}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
