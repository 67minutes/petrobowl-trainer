"use client";

import { useEffect, useState } from "react";
import { Eye, RotateCcw } from "lucide-react";
import type { ReviewRating } from "@/lib/sm2";
import type { DrillQueueCard, DrillReviewResult } from "@/types/drill";

const ratings: { id: ReviewRating; label: string; detail: string }[] = [
  { id: "again", label: "Again", detail: "Wrong" },
  { id: "hard", label: "Hard", detail: "Slow recall" },
  { id: "good", label: "Good", detail: "Correct" },
  { id: "easy", label: "Easy", detail: "Instant" }
];

type DrillCardProps = {
  card: DrillQueueCard | null;
  accessToken: string;
  onReviewed: () => Promise<void>;
};

type ReviewResponse = {
  result?: DrillReviewResult;
  error?: string;
};

export function DrillCard({ card, accessToken, onReviewed }: DrillCardProps) {
  const [shown, setShown] = useState(false);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState<ReviewRating | null>(null);
  const [result, setResult] = useState<DrillReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setShown(false);
    setStartedAt(Date.now());
    setSubmitting(null);
    setResult(null);
    setError(null);
  }, [card?.questionId]);

  async function submitReview(rating: ReviewRating) {
    if (!card) {
      return;
    }

    setSubmitting(rating);
    setError(null);

    try {
      const response = await fetch("/api/drill/review", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          questionId: card.questionId,
          rating,
          responseTimeMs: Math.max(0, Date.now() - startedAt)
        })
      });
      const payload = (await response.json()) as ReviewResponse;

      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? "Review unavailable.");
      }

      setResult(payload.result);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Review unavailable.");
    } finally {
      setSubmitting(null);
    }
  }

  if (!card) {
    return (
      <div className="surface rounded p-5">
        <h2 className="text-lg font-semibold text-ink-900">No matching cards</h2>
        <p className="mt-3 text-sm text-ink-500">
          Try another priority mode or widen the topic selection.
        </p>
      </div>
    );
  }

  return (
    <div className="surface rounded p-5">
      <div className="flex items-start justify-between gap-4 border-b border-ink-200 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-petrol-600">
            {card.topic}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-ink-900">
            {card.isNew ? "New card" : "Due review"}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => {
            setShown(false);
            setResult(null);
            setError(null);
          }}
          className="focus-ring rounded p-2 text-ink-500 transition hover:bg-white hover:text-ink-900"
          title="Reset card"
        >
          <RotateCcw aria-hidden className="h-5 w-5" />
          <span className="sr-only">Reset card</span>
        </button>
      </div>

      <p className="mt-5 min-h-28 text-lg leading-8 text-ink-900">{card.question}</p>

      {shown ? (
        <div className="mt-5 border-l-4 border-petrol-500 bg-petrol-500/10 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-petrol-600">
            {card.acceptedAnswers.length > 1 ? "Accepted answers" : "Answer"}
          </p>
          <p className="mt-1 text-lg font-semibold text-ink-900">
            {card.acceptedAnswers.length > 1 ? card.acceptedAnswers.join(" / ") : card.answer}
          </p>
          {card.imageUrl ? (
            <figure className="mt-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={card.imageUrl}
                alt={card.imageCaption ?? card.answer}
                className="max-h-72 w-auto rounded border border-ink-200 bg-white"
              />
              {card.imageCaption ? (
                <figcaption className="mt-1 text-xs text-ink-500">{card.imageCaption}</figcaption>
              ) : null}
            </figure>
          ) : null}
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
              onClick={() => void submitReview(item.id)}
              disabled={Boolean(result) || Boolean(submitting)}
              className="focus-ring rounded border border-ink-200 bg-white px-3 py-3 text-left transition hover:border-petrol-500 hover:text-petrol-600"
            >
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="text-xs text-ink-500">
                {submitting === item.id ? "Saving" : item.detail}
              </span>
            </button>
          ))}
        </div>
      )}

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      {result ? (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-600">
            Next review: <span className="font-medium text-ink-900">{result.nextReview}</span>, interval{" "}
            <span className="font-medium text-ink-900">{result.intervalDays} days</span>, ease{" "}
            <span className="font-medium text-ink-900">{result.easeFactor.toFixed(2)}</span>.
          </p>
          <button
            type="button"
            onClick={() => void onReviewed()}
            className="focus-ring inline-flex items-center justify-center rounded bg-ink-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-700"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
