import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth/auth-provider";
import { GamificationProvider } from "@/components/gamification/gamification-provider";
import { FxLayer } from "@/components/gamification/fx-layer";
import "./globals.css";

export const metadata: Metadata = {
  title: "PetroBowl Trainer",
  description: "Solo drills, quiz sessions, and analytics for PetroBowl training."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <GamificationProvider>
            {children}
            <FxLayer />
          </GamificationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
