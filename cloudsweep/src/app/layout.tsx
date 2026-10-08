import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "CloudSweep",
  description: "Find duplicates, consolidate and organise everything across OneDrive, Google Drive and more.",
  robots: { index: false, follow: false },
  // Proves site ownership to Google Search Console (needed for Google's OAuth brand verification).
  verification: process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : undefined,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={inter.variable}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
