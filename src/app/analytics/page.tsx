import { RequireAuth } from "@/components/auth/require-auth";
import { AnalyticsContent } from "@/components/analytics/analytics-content";
import { AppShell } from "@/components/app-shell";

export default function AnalyticsPage() {
  return (
    <AppShell
      active="/analytics"
      eyebrow="Analytics"
      title="Training analytics"
      subtitle="Weak subjects, drill consistency, quiz results, and the next work to do."
    >
      <RequireAuth>
        <AnalyticsContent />
      </RequireAuth>
    </AppShell>
  );
}
