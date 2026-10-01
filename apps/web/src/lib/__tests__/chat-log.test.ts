import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { buildChatLogRow } from '@/lib/chat-log';

describe('buildChatLogRow', () => {
  it('scrubs PII from query_raw and sets pii_scrubbed', () => {
    const row = buildChatLogRow(
      { query: 'telp saya 081234567890', refinedQuery: 'telepon', responseState: 'live' },
      'salt',
    );
    expect(row.query_raw).toBe('telp saya [TELP]');
    expect(row.pii_scrubbed).toBe(true);
    expect(row.query_refined).toBe('telepon');
    expect(row.response_state).toBe('live');
  });

  it('scrubs PII from query_refined and reflects it in pii_scrubbed', () => {
    const row = buildChatLogRow(
      { query: 'pertanyaan umum', refinedQuery: 'KTP 3171234567890123 wajib?' },
      'salt',
    );
    expect(row.query_raw).toBe('pertanyaan umum');
    expect(row.query_refined).toBe('KTP [NIK] wajib?');
    expect(row.pii_scrubbed).toBe(true);
  });

  it('hashes the session id with the salt', () => {
    const row = buildChatLogRow({ query: 'x', sessionId: 'abc' }, 'pepper');
    expect(row.session_hash).toBe(
      createHash('sha256').update('abc' + 'pepper').digest('hex'),
    );
  });

  it('stores null session_hash when no session id is given', () => {
    expect(buildChatLogRow({ query: 'x' }, 'salt').session_hash).toBeNull();
  });

  it('stores null session_hash when salt is undefined', () => {
    expect(buildChatLogRow({ query: 'x', sessionId: 'abc' }, undefined).session_hash).toBeNull();
  });

  it('nulls optional text fields when absent', () => {
    const row = buildChatLogRow({ query: 'halo' }, 'salt');
    expect(row.query_refined).toBeNull();
    expect(row.response_state).toBeNull();
    expect(row.pii_scrubbed).toBe(false);
  });
});
