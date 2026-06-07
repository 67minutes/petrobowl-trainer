import { AuthGreeting } from "@/components/auth/auth-greeting";
import { RequireAuth } from "@/components/auth/require-auth";
import { AppShell } from "@/components/app-shell";
import { SessionConsole } from "@/components/session-console";

export default function SessionPage() {
  return (
    <AppShell
      active="/session"
      eyebrow="Buzzer session"
      title={<AuthGreeting fallback="Hi, quizmaster." />}
      subtitle="Run quizmaster-led sessions and capture the scoring data for analytics."
    >
      <RequireAuth adminOnly>
        <SessionConsole />
      </RequireAuth>
    </AppShell>
  );
}
