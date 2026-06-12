'use client';

/**
 * Small reusable validity UI primitives shared by the source card and the document modal.
 *   - ValidityBadge          : icon + Indonesian label (a11y: never color alone)
 *   - DeadContentDisclosure  : collapses dead law behind a DICABUT notice; deliberate reveal
 *   - AcknowledgeGate        : "Saya paham" gate for repealed_no_successor
 */
import { useState } from 'react';
import { Icon } from '../Icon';
import { validityPresentation } from '@/lib/validity-ui';
import type { ValidityState } from '@/lib/validity';

export function ValidityBadge({ state, size = 'sm' }: { state?: ValidityState; size?: 'sm' | 'md' }) {
  const p = validityPresentation(state);
  return (
    <span className={`vp-validity-badge vp-validity--${p.tone} vp-validity-badge--${size}`}>
      <Icon name={p.icon} size={size === 'md' ? 14 : 11} strokeWidth={2.5} />
      {p.label}
    </span>
  );
}

/**
 * Dead-law safety boundary. The dead body is hidden by default behind a "Dicabut" notice and is
 * only shown after a deliberate "Lihat teks lama" action; once revealed it keeps a persistent
 * DICABUT watermark so it can never be mistaken for live text. This is the core safety judgment:
 * the live parkir answer and the dead 4/2020-era refs share identical rupiah figures — a merely
 * dimmed-but-readable dead table would let an officer read dead numbers.
 */
export function DeadContentDisclosure({
  supersededBy,
  children,
}: {
  supersededBy?: string;
  children: React.ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="vp-dead-disclosure">
      <div className="vp-dead-notice">
        <span className="vp-dead-notice-text">
          <Icon name="alert-triangle" size={13} strokeWidth={2.25} />
          Teks aturan ini sudah dicabut{supersededBy ? ` — diganti oleh ${supersededBy}` : ''}.
        </span>
        <button
          type="button"
          className="vp-dead-toggle"
          onClick={() => setRevealed((v) => !v)}
          aria-expanded={revealed}
        >
          {revealed ? 'Sembunyikan' : 'Lihat teks lama'}
          <Icon name={revealed ? 'eye-off' : 'eye'} size={12} />
        </button>
      </div>
      {revealed && (
        <div className="vp-dead-body" data-watermark="DICABUT">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Acknowledgment gate for repealed_no_successor — the only gated state. The content is not shown
 * until the officer presses "Saya paham", forcing a conscious acceptance that the rule is repealed
 * with no in-corpus replacement.
 */
export function AcknowledgeGate({ children }: { children: React.ReactNode }) {
  const [ack, setAck] = useState(false);
  if (ack) return <>{children}</>;
  return (
    <div className="vp-ack-gate">
      <p className="vp-ack-text">
        <Icon name="alert-triangle" size={14} strokeWidth={2.25} />
        Aturan ini sudah dicabut dan belum ada penggantinya di basis data. Mohon verifikasi sebelum
        digunakan sebagai dasar.
      </p>
      <button type="button" className="vp-ack-btn" onClick={() => setAck(true)}>
        Saya paham
      </button>
    </div>
  );
}
