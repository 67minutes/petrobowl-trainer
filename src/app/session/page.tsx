import { AppShell } from "@/components/app-shell";
import { SessionConsole } from "@/components/session-console";

export default function SessionPage() {
  return (
    <AppShell
      active="/session"
      eyebrow="Buzzer session"
      title="Run the room in buzzin.live, score it here."
      subtitle="The quizmaster records who buzzed on each prompt while the app snapshots topic ownership and computes defense/offense scoring."
    >
      <SessionConsole />
    </AppShell>
  );
}
