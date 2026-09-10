'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { GoogleAnalytics } from '@next/third-parties/google';

const KEY = 'vp-analytics-consent';
const CONSENT_COPY =
  'Situs ini memakai Google Analytics untuk memahami penggunaan layanan. Tidak ada isi pertanyaan Anda yang dikirim ke Google.';

export function AnalyticsGate({ gaId }: { gaId?: string }) {
  const [choice, setChoice] = useState<'granted' | 'denied' | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === 'granted' || v === 'denied') setChoice(v);
    } catch {
      /* storage disabled — show the bar, don't load GA */
    }
    setReady(true);
  }, []);

  const decide = (v: 'granted' | 'denied') => {
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* ignore */
    }
    setChoice(v);
  };

  if (!gaId || !ready) return null;

  return (
    <>
      {choice === 'granted' && <GoogleAnalytics gaId={gaId} />}
      {choice === null && (
        <div
          role="dialog"
          aria-label="Persetujuan analitik"
          style={{
            position: 'fixed',
            insetInline: 0,
            bottom: 0,
            zIndex: 60,
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0.9rem 1rem',
            background: '#0f2e22',
            color: '#f3f6f4',
            fontSize: '0.85rem',
            lineHeight: 1.4,
          }}
        >
          <span style={{ maxWidth: '48ch' }}>
            {CONSENT_COPY}{' '}
            <Link href="/privasi" style={{ textDecoration: 'underline', color: '#f3f6f4' }}>
              Kebijakan Privasi
            </Link>
          </span>
          <span style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => decide('denied')}
              style={{
                padding: '0.4rem 0.9rem',
                borderRadius: 6,
                border: '1px solid #f3f6f4',
                background: 'transparent',
                color: '#f3f6f4',
                cursor: 'pointer',
              }}
            >
              Tolak
            </button>
            <button
              onClick={() => decide('granted')}
              style={{
                padding: '0.4rem 0.9rem',
                borderRadius: 6,
                border: 'none',
                background: '#c8a24a',
                color: '#0f2e22',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Terima
            </button>
          </span>
        </div>
      )}
    </>
  );
}
