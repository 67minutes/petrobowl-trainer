import { clsx } from "clsx";

type StatRowProps = {
  label: string;
  value: string;
  detail?: string;
  tone?: "default" | "good" | "warn";
};

export function StatRow({ label, value, detail, tone = "default" }: StatRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-ink-200 py-4 last:border-b-0">
      <div>
        <p className="text-sm font-medium text-ink-900">{label}</p>
        {detail ? <p className="mt-1 text-xs text-ink-500">{detail}</p> : null}
      </div>
      <p
        className={clsx(
          "text-right text-2xl font-semibold",
          tone === "good" && "text-emerald-600",
          tone === "warn" && "text-signal-600",
          tone === "default" && "text-ink-900"
        )}
      >
        {value}
      </p>
    </div>
  );
}
