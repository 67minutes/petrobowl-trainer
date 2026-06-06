import { AuthGreeting } from "@/components/auth/auth-greeting";
import { RequireAuth } from "@/components/auth/require-auth";
import { AppShell } from "@/components/app-shell";
import { SessionConsole } from "@/components/session-console";

export default function SessionPage() {
  return (
    <AppShell
      active="/session"
      eyebrow="Hello"
      title={<AuthGreeting fallback="Hi, quizmaster." />}
    >
      <RequireAuth adminOnly>
        <SessionConsole />
      </RequireAuth>
    </AppShell>
  );
}
