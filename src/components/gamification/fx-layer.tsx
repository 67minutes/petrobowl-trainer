"use client";

import { Award, Snowflake, Sparkles, Star } from "lucide-react";
import { useGamification } from "@/components/gamification/gamification-provider";

export function FxLayer() {
  const { fxItems } = useGamification();

  const gains = fxItems.filter((fx) => fx.kind === "gain");
  const banners = fxItems.filter((fx) => fx.kind === "banner");
  const toasts = fxItems.filter((fx) => fx.kind === "toast");

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {/* Floating XP gains — top center, under the header. */}
      <div className="absolute left-1/2 top-20 -translate-x-1/2">
        {gains.map((fx) =>
          fx.kind === "gain" ? (
            <div
              key={fx.id}
              className="animate-float-up flex flex-col items-center gap-1"
            >
              <span className="rounded-full bg-gold-500 px-4 py-1.5 text-lg font-extrabold text-white shadow-glow">
                +{fx.xp} XP
              </span>
              <span className="flex items-center gap-2">
                {fx.combo >= 2 ? (
                  <span className="rounded-full bg-combo-500 px-2.5 py-0.5 text-sm font-bold text-white">
                    Combo x{fx.combo}
                  </span>
                ) : null}
                {fx.doubleXp ? (
                  <span className="rounded-full bg-flame-500 px-2.5 py-0.5 text-sm font-bold text-white">
                    2× weekend
                  </span>
                ) : null}
              </span>
            </div>
          ) : null
        )}
      </div>

      {/* Big center banners — level up / mastery. */}
      <div className="absolute left-1/2 top-1/3 flex -translate-x-1/2 flex-col items-center gap-2">
        {banners.map((fx) =>
          fx.kind === "banner" ? (
            <div
              key={fx.id}
              className="animate-banner-in flex items-center gap-3 rounded-2xl bg-ink-900/95 px-7 py-4 text-white shadow-glow"
            >
              {fx.tone === "level" ? (
                <Star aria-hidden className="h-8 w-8 text-gold-400" />
              ) : (
                <Sparkles aria-hidden className="h-8 w-8 text-combo-400" />
              )}
              <div>
                <p className="text-2xl font-extrabold leading-tight">{fx.title}</p>
                <p className="text-sm text-ink-200">{fx.subtitle}</p>
              </div>
            </div>
          ) : null
        )}
      </div>

      {/* Toasts — bottom right stack. */}
      <div className="absolute bottom-5 right-5 flex flex-col gap-2">
        {toasts.map((fx) =>
          fx.kind === "toast" ? (
            <div
              key={fx.id}
              className="animate-banner-in flex items-center gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3 shadow-lg"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold-500/15">
                {fx.icon === "achievement" ? (
                  <Award aria-hidden className="h-5 w-5 text-gold-600" />
                ) : fx.icon === "freeze" ? (
                  <Snowflake aria-hidden className="h-5 w-5 text-petrol-600" />
                ) : (
                  <Sparkles aria-hidden className="h-5 w-5 text-combo-600" />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-900">{fx.title}</p>
                <p className="truncate text-xs text-ink-500">{fx.subtitle}</p>
              </div>
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}
