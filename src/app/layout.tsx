import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://lenzy.studio"),
  title: "Lenzy — Eyewear Creative Intelligence",
  description: "Lenzy tracks global eyewear brands on Instagram and reimagines their posts for your catalog. Live feed, AI analysis, and one-tap creative reimagining.",
  openGraph: {
    title: "Lenzy — Eyewear Creative Intelligence",
    description: "Track global eyewear brands on Instagram and reimagine their posts for your catalog.",
    url: "https://lenzy.studio",
    siteName: "Lenzy",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
