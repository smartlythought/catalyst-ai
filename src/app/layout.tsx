import type { Metadata, Viewport } from "next";
import { Manrope, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  weight: ["400", "500", "600", "700", "800"],
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Catalyst — AI Stock Analyst",
  description:
    "AI-powered stock analysis with real-time signals, insider tracking, and actionable calls.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Catalyst",
  },
  openGraph: {
    title: "Catalyst — AI Stock Analyst",
    description: "Real-time AI stock signals with BUY/REDUCE/WATCH calls.",
    url: "https://claudeo.ai",
    siteName: "Catalyst",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0A0C10",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${ibmPlexMono.variable}`}
    >
      <body className="min-h-dvh bg-bg-app text-text-primary font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
