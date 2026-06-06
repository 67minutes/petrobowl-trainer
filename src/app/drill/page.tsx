import { AuthGreeting } from "@/components/auth/auth-greeting";
import { RequireAuth } from "@/components/auth/require-auth";
import { AppShell } from "@/components/app-shell";
import { DrillWorkspace } from "@/components/drill/drill-workspace";

export default function DrillPage() {
  return (
    <AppShell
      active="/drill"
      eyebrow="Hello"
      title={<AuthGreeting />}
    >
      <RequireAuth>
        <DrillWorkspace />
      </RequireAuth>
    </AppShell>
  );
}
