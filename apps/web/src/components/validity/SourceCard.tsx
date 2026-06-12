'use client';

/**
 * Source card — consumes the validity contract the route streams (validity + role + node_type).
 * Three on-card treatments, branched off validity.state + role:
 *   - live                     → normal card + green "Berlaku" badge
 *   - repealed_with_successor  → demoted/subordinate footnote, dead body collapsed (DeadContentDisclosure)
 *   - repealed_no_successor    → amber gated card, content behind "Saya paham" (AcknowledgeGate)
 * (out_of_coverage / successor_unretrieved never reach a card — see ValidityNotice.)
 */
import { useState } from 'react';
import { Icon } from '../Icon';
import { ValidityBadge, DeadContentDisclosure, AcknowledgeGate } from './ValidityBits';
import { type Source, pasalLabel, perdaRef, isDeadSource } from '@/lib/validity-ui';

export function VPSourceCard({
  source,
  onViewFull,
}: {
  source: Source;
  onViewFull: (s: Source) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const state = source.validity?.state ?? 'live';
  const dead = isDeadSource(source); // repealed_with_successor / role:demoted
  const gated = state === 'repealed_no_successor';
  const ref = perdaRef(source.metadata);
  const label = pasalLabel(source.metadata);
  const supersededBy = source.validity?.repealedBy?.label;
  const isLong = source.content.length > 120;

  const cardClass = dead
    ? 'vp-source-card vp-source-card--demoted'
    : gated
      ? 'vp-source-card vp-source-card--gated'
      : 'vp-source-card vp-source-card--live';

  return (
    <div className={cardClass}>
      <div className="vp-source-header">
        <ValidityBadge state={state} />
        <span className="vp-source-ref">{ref}</span>
        <span className="vp-source-dot">·</span>
        <span className="vp-source-pasal">{label}</span>
      </div>

      {dead ? (
        <>
          {supersededBy && <div className="vp-source-superseded">Diganti oleh {supersededBy}</div>}
          <DeadContentDisclosure supersededBy={supersededBy}>
            <div className="vp-source-text">{source.content}</div>
          </DeadContentDisclosure>
        </>
      ) : gated ? (
        <AcknowledgeGate>
          <div className="vp-source-text">{source.content}</div>
        </AcknowledgeGate>
      ) : (
        <div
          className={`vp-source-text ${!expanded && isLong ? 'vp-source-truncated' : ''} ${isLong ? 'vp-clickable' : ''}`}
          onClick={() => isLong && setExpanded(!expanded)}
        >
          {source.content}
        </div>
      )}

      <div className="vp-source-actions">
        {!dead && !gated && isLong ? (
          <button className="vp-source-btn" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Tutup' : 'Selengkapnya'}
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={12} />
          </button>
        ) : (
          <span />
        )}
        <button className="vp-source-btn vp-source-open" onClick={() => onViewFull(source)}>
          Buka Dokumen
          <Icon name="external-link" size={12} />
        </button>
      </div>
    </div>
  );
}
