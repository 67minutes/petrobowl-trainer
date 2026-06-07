import { RequireAuth } from "@/components/auth/require-auth";
import { AppShell } from "@/components/app-shell";
import { DrillWorkspace } from "@/components/drill/drill-workspace";

export default function DrillPage() {
  return (
    <AppShell
      active="/drill"
      eyebrow="Solo drill"
      title="Choose your drill plan"
      subtitle="Train assigned topics by priority: scheduled reviews, weak cards, or new terms."
    >
      <RequireAuth>
        <DrillWorkspace />
      </RequireAuth>
    </AppShell>
  );
}
