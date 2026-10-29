import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Audience Asks",
  description: "Paste a YouTube channel and see what its viewers keep asking for, ranked, with the real comments behind each ask.",
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
