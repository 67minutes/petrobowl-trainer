import { AppShell } from "@/components/app-shell";
import { AuthGreeting } from "@/components/auth/auth-greeting";
import { RequireAuth } from "@/components/auth/require-auth";
import { SessionRunner } from "@/components/session-runner";

export default async function SessionRunPage({
  params
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  return (
    <AppShell
      active="/session"
      eyebrow="Buzzer session"
      title={<AuthGreeting fallback="Hi, quizmaster." />}
      subtitle="Run the selected quizmaster session."
    >
      <RequireAuth adminOnly>
        <SessionRunner sessionId={sessionId} />
      </RequireAuth>
    </AppShell>
  );
}
