import { AuthGreeting } from "@/components/auth/auth-greeting";
import { RequireAuth } from "@/components/auth/require-auth";
import { AnalyticsContent } from "@/components/analytics/analytics-content";
import { AppShell } from "@/components/app-shell";

export default function AnalyticsPage() {
  return (
    <AppShell
      active="/analytics"
      eyebrow="Hello"
      title={<AuthGreeting fallback="Hi, team." />}
    >
      <RequireAuth>
        <AnalyticsContent />
      </RequireAuth>
    </AppShell>
  );
}
