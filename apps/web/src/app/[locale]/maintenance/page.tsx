import type { Metadata } from 'next';
import { ConstructionIcon } from 'lucide-react';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';

export const metadata: Metadata = { title: 'Sedang Pemeliharaan' };

const ID = {
  title: 'Sedang Dalam Pemeliharaan',
  body: 'Vector Pasal sedang menjalani pemeliharaan terjadwal. Layanan akan kembali normal dalam waktu singkat.',
  footer: 'Mohon coba lagi beberapa saat lagi. Terima kasih atas kesabaran Anda.',
};

const EN = {
  title: 'Under Maintenance',
  body: 'Vector Pasal is currently undergoing scheduled maintenance. The service will be back shortly.',
  footer: 'Please check back again soon. Thank you for your patience.',
};

export default async function MaintenancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = locale === 'en' ? EN : ID;

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.25rem',
        background: 'var(--vp-bg)',
      }}
    >
      <div
        style={{
          maxWidth: '32rem',
          width: '100%',
          textAlign: 'center',
          background: 'var(--vp-surface)',
          border: '1px solid var(--vp-border)',
          borderRadius: 'var(--vp-radius)',
          boxShadow: 'var(--vp-shadow-lg)',
          padding: '3rem 2rem',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            margin: '0 auto 1.5rem',
            borderRadius: 'var(--vp-radius-sm)',
            background: 'linear-gradient(150deg, var(--vp-primary) 0%, var(--vp-primary-deep) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--vp-shadow-brand)',
          }}
        >
          <ConstructionIcon size={26} color="#FFFFFF" strokeWidth={1.75} />
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-newsreader), serif',
            fontSize: '1.75rem',
            fontWeight: 500,
            color: 'var(--vp-ink)',
            marginBottom: '0.75rem',
          }}
        >
          {t.title}
        </h1>
        <p style={{ color: 'var(--vp-text-secondary)', lineHeight: 1.6 }}>{t.body}</p>
        <p style={{ color: 'var(--vp-text-dim)', fontSize: '13px', marginTop: '1.5rem' }}>
          {t.footer}
        </p>
      </div>
    </div>
  );
}
