"use client";

import { useMemo, useState } from "react";
import { Eye, RotateCcw } from "lucide-react";
import { reviewCard, type ReviewRating } from "@/lib/sm2";

const sampleCard = {
  question:
    "A pressure transient analysis method used to estimate reservoir pressure, permeability, and wellbore storage from pressure behavior after flow rate changes.",
  answer: "Well test analysis",
  topic: "Well Test"
};

const ratings: { id: ReviewRating; label: string; detail: string }[] = [
  { id: "again", label: "Again", detail: "Wrong" },
  { id: "hard", label: "Hard", detail: "Slow recall" },
  { id: "good", label: "Good", detail: "Correct" },
  { id: "easy", label: "Easy", detail: "Instant" }
];

export function DrillCard() {
  const [shown, setShown] = useState(false);
  const [rating, setRating] = useState<ReviewRating | null>(null);

  const preview = useMemo(() => {
    if (!rating) {
      return null;
    }
    return reviewCard({ easeFactor: 2.5, intervalDays: 1, repetitions: 0 }, rating, new Date("2026-06-06T00:00:00Z"));
  }, [rating]);

  return (
    <div className="surface rounded p-5">
      <div className="flex items-start justify-between gap-4 border-b border-ink-200 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-petrol-600">
            {sampleCard.topic}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-ink-900">Due review</h2>
        </div>
        <button
          type="button"
          onClick={() => {
            setShown(false);
            setRating(null);
          }}
          className="focus-ring rounded p-2 text-ink-500 transition hover:bg-white hover:text-ink-900"
          title="Reset card"
        >
          <RotateCcw aria-hidden className="h-5 w-5" />
          <span className="sr-only">Reset card</span>
        </button>
      </div>

      <p className="mt-5 min-h-28 text-lg leading-8 text-ink-900">{sampleCard.question}</p>

      {shown ? (
        <div className="mt-5 border-l-4 border-petrol-500 bg-petrol-500/10 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-petrol-600">Answer</p>
          <p className="mt-1 text-lg font-semibold text-ink-900">{sampleCard.answer}</p>
        </div>
      ) : null}

      {!shown ? (
        <button
          type="button"
          onClick={() => setShown(true)}
          className="focus-ring mt-6 inline-flex items-center gap-2 rounded bg-ink-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-700"
        >
          <Eye aria-hidden className="h-4 w-4" />
          Show Answer
        </button>
      ) : (
        <div className="mt-6 grid gap-2 sm:grid-cols-4">
          {ratings.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setRating(item.id)}
              className="focus-ring rounded border border-ink-200 bg-white px-3 py-3 text-left transition hover:border-petrol-500 hover:text-petrol-600"
            >
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="text-xs text-ink-500">{item.detail}</span>
            </button>
          ))}
        </div>
      )}

      {preview ? (
        <p className="mt-4 text-sm text-ink-600">
          Next review: <span className="font-medium text-ink-900">{preview.nextReview}</span>, interval{" "}
          <span className="font-medium text-ink-900">{preview.intervalDays} days</span>, ease{" "}
          <span className="font-medium text-ink-900">{preview.easeFactor.toFixed(2)}</span>.
        </p>
      ) : null}
    </div>
  );
}
