'use client';

/**
 * "Buka Dokumen" detail modal — the second place a source's full text (and a copy button) appears,
 * so it carries the same validity treatment as the card. For a dead (repealed/demoted) source the
 * body is collapsed behind a DICABUT notice and the "Salin" (copy) button is suppressed — an officer
 * must not be able to copy dead numbers out of an authoritative-looking modal.
 */
import { useState } from 'react';
import { Icon } from '../Icon';
import { ValidityBadge } from './ValidityBits';
import { type Source, pasalLabel, perdaRef, isDeadSource } from '@/lib/validity-ui';

export function DocumentModal({ source, onClose }: { source: Source; onClose: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const dead = isDeadSource(source);
  const state = source.validity?.state ?? 'live';
  const supersededBy = source.validity?.repealedBy?.label;

  return (
    <div className="vp-modal-overlay" onClick={onClose}>
      <div className="vp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="vp-modal-header">
          <div>
            <h3 className="vp-modal-title">
              <Icon name="file-text" size={18} style={{ marginRight: 8 }} />
              Detail Dokumen
            </h3>
            {source.metadata && (
              <p className="vp-modal-subtitle">
                {perdaRef(source.metadata)} · {pasalLabel(source.metadata)}
              </p>
            )}
            <div className="vp-modal-badge-row">
              <ValidityBadge state={state} size="md" />
            </div>
          </div>
          <button type="button" className="vp-modal-close" onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>

        {dead ? (
          <div className="vp-modal-body">
            <div className="vp-dead-notice vp-dead-notice--modal">
              <span className="vp-dead-notice-text">
                <Icon name="alert-triangle" size={14} strokeWidth={2.25} />
                Teks ini berasal dari aturan yang sudah dicabut
                {supersededBy ? ` dan diganti oleh ${supersededBy}` : ''}. Jangan dijadikan dasar
                penetapan.
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
              <div className="vp-doc-body vp-dead-body" data-watermark="DICABUT">
                {source.content}
              </div>
            )}
          </div>
        ) : (
          <div className="vp-modal-body vp-doc-body">{source.content}</div>
        )}

        <div className="vp-modal-footer">
          {!dead && (
            <button
              type="button"
              className="vp-btn-ghost"
              onClick={() => {
                if (navigator.clipboard?.writeText) navigator.clipboard.writeText(source.content);
              }}
            >
              <Icon name="copy" size={14} /> Salin
            </button>
          )}
          <button type="button" className="vp-btn-primary" onClick={onClose}>
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
