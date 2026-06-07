import { clsx } from "clsx";

type ActivityHeatmapProps = {
  days: { day: number; count: number }[];
};

export function ActivityHeatmap({ days }: ActivityHeatmapProps) {
  return (
    <div className="grid grid-cols-7 gap-1" aria-label="Review activity">
      {days.map((day) => (
        <div
          key={day.day}
          title={`Day ${day.day}: ${day.count} reviews`}
          className={clsx(
            "aspect-square rounded-sm transition hover:scale-110",
            day.count === 0 && "bg-ink-200",
            day.count > 0 && day.count < 10 && "bg-petrol-400/35",
            day.count >= 10 && day.count < 25 && "bg-petrol-400",
            day.count >= 25 && "bg-petrol-600"
          )}
        />
      ))}
    </div>
  );
}
