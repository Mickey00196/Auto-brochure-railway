import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Real Estate Brochure Engine",
  description: "Institutional-grade CRE brochures, generated from a live Building/Unit/Proposal data model.",
};

/** Bare document shell only. The broker app's chrome (nav bar, centred
 * max-width <main>) lives in (app)/layout.tsx, so the public client brochure
 * at /s/[slug] can run edge to edge instead of inside that box. */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
