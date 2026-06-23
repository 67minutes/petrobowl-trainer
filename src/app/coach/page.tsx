import { RequireAuth } from "@/components/auth/require-auth";
import { AppShell } from "@/components/app-shell";
import { CoachContent } from "@/components/coach/coach-content";

export default function CoachPage() {
  return (
    <AppShell
      active="/coach"
      eyebrow="Coach"
      title="Strategy dashboard"
      subtitle="Topic strength, offense vs defense, training readiness, and speed — for assignment and game-day calls."
    >
      <RequireAuth>
        <CoachContent />
      </RequireAuth>
    </AppShell>
  );
}
