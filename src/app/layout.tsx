import type { Metadata, Viewport } from "next";
import "./globals.css";

// The favicon, Apple icon and share image are the files next to this one (favicon.ico, icon.svg,
// apple-icon.png, opengraph-image.tsx); Next adds their tags.
export const metadata: Metadata = {
  metadataBase: new URL("https://audience-asks.vercel.app"),
  title: "Audience Asks: turn YouTube comments into video ideas",
  description:
    "Paste any YouTube channel to see what its viewers keep asking for, ranked, with the real comments behind each ask and a video idea to answer it.",
  // A shared ?channel= link starts a run, so every variant points search engines at the home page.
  alternates: { canonical: "/" },
  openGraph: { type: "website", siteName: "Audience Asks", url: "/" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#0a0d15",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Satoshi, the typeface vidIQ uses, served by Fontshare under the ITF Free Font License. */}
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
