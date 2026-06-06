import { AuthGreeting } from "@/components/auth/auth-greeting";
import { AuthPanel } from "@/components/auth/auth-panel";
import { AppShell } from "@/components/app-shell";
import { HomeContent } from "@/components/home/home-content";

export default function Home() {
  return (
    <AppShell
      active="/"
      eyebrow="Hello"
      title={<AuthGreeting />}
      aside={<AuthPanel />}
    >
      <HomeContent />
    </AppShell>
  );
}
