import { AppShell } from "@/components/app-shell";
import { SessionConsole } from "@/components/session-console";

export default function SessionPage() {
  return (
    <AppShell
      active="/session"
      eyebrow="Hello"
      title="Hi, quizmaster."
    >
      <SessionConsole />
    </AppShell>
  );
}
