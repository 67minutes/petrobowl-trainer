type ProgressBarProps = {
  value: number;
  label: string;
};

export function ProgressBar({ value, label }: ProgressBarProps) {
  const bounded = Math.max(0, Math.min(100, value));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-ink-500">
        <span>{label}</span>
        <span>{Math.round(bounded)}%</span>
      </div>
      <div className="h-2 rounded bg-ink-200">
        <div
          className="h-2 rounded bg-petrol-500 transition-all duration-500"
          style={{ width: `${bounded}%` }}
        />
      </div>
    </div>
  );
}
