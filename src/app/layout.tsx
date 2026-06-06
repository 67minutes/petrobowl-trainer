import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PetroBowl Trainer",
  description: "Solo drill and buzzer scoring workflow for SPE ITB PetroBowl."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
