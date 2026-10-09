import type { Metadata } from "next";
import "./globals.css";
import "./cockpit.css";
import "./typography.css";

export const metadata: Metadata = {
  title: "ERPsim Cockpit · Unternehmenssteuerung",
  description:
    "Sales, Markt, Marketing, Liquidität und Fertigung in einer gemeinsamen Arbeitsansicht.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/cockpit.svg",
    shortcut: "/cockpit.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className="antialiased">{children}</body>
    </html>
  );
}
