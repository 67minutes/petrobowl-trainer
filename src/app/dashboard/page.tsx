import { AuthGreeting } from "@/components/auth/auth-greeting";
import { RequireAuth } from "@/components/auth/require-auth";
import { AppShell } from "@/components/app-shell";
import { DashboardContent } from "@/components/dashboard/dashboard-content";

export default function DashboardPage() {
  return (
    <AppShell
      active="/dashboard"
      eyebrow="Hello"
      title={<AuthGreeting />}
    >
      <RequireAuth>
        <DashboardContent />
      </RequireAuth>
    </AppShell>
  );
}
