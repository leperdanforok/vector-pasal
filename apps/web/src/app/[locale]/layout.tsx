import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { setRequestLocale, getMessages } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { routing } from "@/i18n/routing";
import MotionProvider from "@/components/MotionProvider";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  manifest: "/site.webmanifest",
  title: "Vector Pasal | Satpol PP Bolmong",
  description: "AI Perda Assistant untuk Satpol PP Kabupaten Bolaang Mongondow",
  icons: {
    icon: "/icon.png", 
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
  openGraph: {
    title: "Vector Pasal | Satpol PP Bolmong",
    description: "AI Perda Assistant",
    type: "website",
  },
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <MotionProvider>
        <main id="main-content">{children}</main>
      </MotionProvider>
    </NextIntlClientProvider>
  );
}