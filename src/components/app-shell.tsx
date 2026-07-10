import Link from "next/link";
import {
  BarChart3,
  BookOpenCheck,
  ClipboardList,
  Gauge,
  RadioTower,
  Settings2,
  Target,
  Trophy
} from "lucide-react";
import { clsx } from "clsx";
import { SessionMenu } from "@/components/auth/session-menu";
import { XpHud } from "@/components/gamification/xp-hud";

const navItems = [
  { href: "/", label: "Home", icon: Gauge },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/drill", label: "Drill", icon: BookOpenCheck },
  { href: "/rewards", label: "Rewards", icon: Trophy },
  { href: "/session", label: "Session", icon: RadioTower },
  { href: "/analytics", label: "Analytics", icon: ClipboardList },
  { href: "/coach", label: "Coach", icon: Target },
  { href: "/admin", label: "Admin", icon: Settings2 }
];

type AppShellProps = {
  active: string;
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
};

export function AppShell({ active, eyebrow, title, subtitle, children, aside }: AppShellProps) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-ink-200 bg-ink-50/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded bg-ink-900 text-sm font-semibold text-white">
              PB
            </span>
            <span>
              <span className="block text-sm font-semibold leading-5 text-ink-900">
                PetroBowl Trainer
              </span>
              <span className="block text-xs text-ink-500">SPE ITB 2026</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "focus-ring inline-flex items-center gap-2 rounded px-3 py-2 text-sm transition",
                    isActive
                      ? "bg-ink-900 text-white"
                      : "text-ink-600 hover:bg-white hover:text-ink-900"
                  )}
                >
                  <Icon aria-hidden className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-3">
            <XpHud />
            <SessionMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-8 px-4 py-7 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8">
        <section className="min-w-0">
          <div className="mb-7">
            {eyebrow ? (
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-petrol-600">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="max-w-4xl text-3xl font-semibold tracking-normal text-ink-900 sm:text-4xl">
              {title}
            </h1>
            {subtitle ? <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-600">{subtitle}</p> : null}
          </div>
          {children}
        </section>
        {aside ? <aside className="min-w-0 lg:pt-20">{aside}</aside> : null}
      </main>
    </div>
  );
}
