import type { Metadata } from "next";
import { Manrope, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
});

export const metadata: Metadata = {
  title: {
    default: "RAIS CRM",
    template: "%s · RAIS CRM",
  },
  description: "Kaltakquise — Liste, Kunden, Detail",
  applicationName: "RAIS CRM",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    title: "RAIS CRM",
    capable: true,
    statusBarStyle: "default",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className={`${manrope.variable} ${sourceSerif.variable}`}>
        {children}
      </body>
    </html>
  );
}
