import type { Metadata } from "next";
import { Instrument_Serif, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { getLocale } from "next-intl/server";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  display: "swap",
  weight: "400",
  style: ["normal", "italic"],
});

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

// Look for the "export const metadata" section right above your code
export const metadata: Metadata = {
  metadataBase: new URL("https://vectorpasal.vercel.app"),
  title: {
    default: "Vector Pasal — Asisten AI Perda Bolmong",
    template: "%s | Vector Pasal",
  },
  description: "Akses cepat Peraturan Daerah Kabupaten Bolaang Mongondow dengan asisten AI.",
  manifest: "/site.webmanifest",
  other: {
    "msapplication-TileColor": "#FBFCFA",
    // If you don't have this file, you can comment this line out
    // "msapplication-TileImage": "/mstile-150x150.png", 
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <head>
        <meta name="theme-color" content="#FBFCFA" />
      </head>
      <body
        className={`${instrumentSerif.variable} ${instrumentSans.variable} ${jetbrainsMono.variable} antialiased font-sans`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}
