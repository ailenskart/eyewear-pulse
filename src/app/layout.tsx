import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://lenzy.studio"),
  title: "Lenzy — Eyewear Intelligence",
  description: "The knowledge brain for the global eyewear industry.",
  openGraph: {
    title: "Lenzy — Eyewear Intelligence",
    description: "The knowledge brain for the global eyewear industry.",
    url: "https://lenzy.studio",
    siteName: "Lenzy",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="preconnect" href="https://rsms.me/" />
        <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
