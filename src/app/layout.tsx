import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: {
    default: "RAIS CRM",
    template: "%s · RAIS CRM",
  },
  description: "Akquise-CRM — Leads, Wiedervorlagen, E-Mail",
  applicationName: "RAIS CRM",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    title: "RAIS CRM",
    capable: true,
    statusBarStyle: "default",
  },
};

// Farbe der Titelleiste der installierten App — folgt Hell/Dunkel des Systems.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1b1b" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={manrope.variable}>{children}</body>
    </html>
  );
}
