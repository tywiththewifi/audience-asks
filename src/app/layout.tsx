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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
