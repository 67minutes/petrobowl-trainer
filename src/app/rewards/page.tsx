import { RequireAuth } from "@/components/auth/require-auth";
import { AppShell } from "@/components/app-shell";
import { RewardsContent } from "@/components/rewards/rewards-content";

export default function RewardsPage() {
  return (
    <AppShell
      active="/rewards"
      eyebrow="Rewards"
      title="Your arcade"
      subtitle="Level up, keep your streak alive, complete quests, and unlock cosmetics — all powered by the same spaced-repetition drills."
    >
      <RequireAuth>
        <RewardsContent />
      </RequireAuth>
    </AppShell>
  );
}
