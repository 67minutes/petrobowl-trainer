"use client";

import { useState } from "react";
import { Upload } from "lucide-react";

type ImportResponse = {
  dryRun: boolean;
  summary?: {
    topicCount: number;
    questionCount: number;
    warnings: string[];
    skippedSheets: string[];
    topics: { name: string; assignedTo: string | null; questionCount: number }[];
  };
  result?: {
    topicCount: number;
    questionCount: number;
    assignmentCount: number;
  };
  error?: string;
};

export function ImportPanel() {
  const [response, setResponse] = useState<ImportResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(formData: FormData) {
    setLoading(true);
    setResponse(null);
    formData.set("dryRun", "true");

    const result = await fetch("/api/import", {
      method: "POST",
      body: formData
    });

    setResponse((await result.json()) as ImportResponse);
    setLoading(false);
  }

  return (
    <form action={submit} className="surface rounded p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">Hello, admin.</h2>
        </div>
        <Upload aria-hidden className="h-5 w-5 text-petrol-600" />
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <input
          name="file"
          type="file"
          accept=".xlsx,.xls"
          required
          className="focus-ring min-w-0 flex-1 rounded border border-ink-200 bg-white px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="focus-ring rounded bg-ink-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Parsing" : "Dry Run"}
        </button>
      </div>

      {response?.error ? <p className="mt-4 text-sm text-red-600">{response.error}</p> : null}

      {response?.summary ? (
        <div className="mt-5 border-t border-ink-200 pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <p className="text-sm">
              <span className="block text-xs text-ink-500">Topics</span>
              <span className="text-xl font-semibold text-ink-900">{response.summary.topicCount}</span>
            </p>
            <p className="text-sm">
              <span className="block text-xs text-ink-500">Questions</span>
              <span className="text-xl font-semibold text-ink-900">
                {response.summary.questionCount.toLocaleString()}
              </span>
            </p>
            <p className="text-sm">
              <span className="block text-xs text-ink-500">Skipped</span>
              <span className="text-xl font-semibold text-ink-900">
                {response.summary.skippedSheets.length}
              </span>
            </p>
          </div>
          {response.summary.warnings.length ? (
            <ul className="mt-4 space-y-1 text-sm text-signal-600">
              {response.summary.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
