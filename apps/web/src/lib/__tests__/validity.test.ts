import { describe, it, expect, vi } from 'vitest';
import {
  tagValidity,
  classifyByValidity,
  decideAnswer,
  type MatchLike,
  type ValidityInfo,
} from '../validity';

// Minimal supabase stub: only .rpc('get_repeal_facts', ...) is used by tagValidity.
function stubSupabase(rows: unknown[], error: unknown = null) {
  return { rpc: vi.fn().mockResolvedValue({ data: rows, error }) } as any;
}

const live = (extra: Record<string, unknown> = {}): MatchLike => ({ validity: { state: 'live' }, ...extra });
const rs = (label = 'Perda No 1/2024'): MatchLike => ({
  validity: { state: 'repealed_with_successor', repealedBy: { successorWorkId: 3, number: '1', year: 2024, label } },
});
const rn = (): MatchLike => ({ validity: { state: 'repealed_no_successor' } });

describe('tagValidity (state mapping)', () => {
  it('marks works with no repeal edge as live', async () => {
    const sb = stubSupabase([]);
    const map = await tagValidity([3, 2], sb);
    expect(map.get(3)).toEqual({ state: 'live' });
    expect(map.get(2)).toEqual({ state: 'live' });
  });

  it('marks a repealed work whose successor has nodes as repealed_with_successor', async () => {
    const sb = stubSupabase([
      { work_id: 4, successor_work_id: 3, successor_register_id: null, successor_number: '1', successor_year: 2024, successor_node_count: 566 },
    ]);
    const map = await tagValidity([4], sb);
    const info = map.get(4) as ValidityInfo;
    expect(info.state).toBe('repealed_with_successor');
    expect(info.repealedBy?.successorWorkId).toBe(3);
    expect(info.repealedBy?.label).toBe('Perda No 1/2024');
  });

  it('marks a repeal whose successor has no in-corpus text as repealed_no_successor', async () => {
    const sb = stubSupabase([
      // register successor (no work) → node_count 0
      { work_id: 9, successor_work_id: null, successor_register_id: 1, successor_number: '20', successor_year: 2010, successor_node_count: 0 },
    ]);
    const map = await tagValidity([9], sb);
    expect((map.get(9) as ValidityInfo).state).toBe('repealed_no_successor');
  });

  it('fails safe (all live) but does not throw when the RPC errors', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const sb = stubSupabase([], { message: 'boom' });
    const map = await tagValidity([4], sb);
    expect((map.get(4) as ValidityInfo).state).toBe('live');
    errSpy.mockRestore();
  });
});

describe('classifyByValidity', () => {
  it('groups matches by state', () => {
    const groups = classifyByValidity([live(), rs(), rn(), live()]);
    expect(groups.live).toHaveLength(2);
    expect(groups.repealedWithSuccessor).toHaveLength(1);
    expect(groups.repealedNoSuccessor).toHaveLength(1);
  });
});

describe('decideAnswer (answer-safety partition)', () => {
  it('answers from live nodes (hero), never the dead RS node', () => {
    const liveNode = live({ id: 1 });
    const d = decideAnswer({
      liveMatches: [liveNode],
      successorLiveMatches: [],
      repealedNoSuccessor: [],
      repealedWithSuccessor: [rs()],
    });
    expect(d.responseState).toBe('live');
    expect(d.answerNodes).toEqual([liveNode]);
    expect(d.answerNodes).not.toContainEqual(expect.objectContaining({ validity: { state: 'repealed_with_successor' } as any }));
  });

  it('uses force-fetched live successor nodes when primary retrieval had none', () => {
    const successorNode = live({ id: 99, work_id: 3 });
    const d = decideAnswer({
      liveMatches: [],
      successorLiveMatches: [successorNode],
      repealedNoSuccessor: [],
      repealedWithSuccessor: [rs()],
    });
    expect(d.responseState).toBe('live');
    expect(d.answerNodes).toEqual([successorNode]);
  });

  // THE BLOCKING HOLE: repealed work with an in-corpus successor, but neither primary
  // retrieval nor the force-fetch surfaced a live article. Must NOT serve dead content.
  it('returns successor_unretrieved (no dead content) when RS successor not retrieved', () => {
    const d = decideAnswer({
      liveMatches: [],
      successorLiveMatches: [],
      repealedNoSuccessor: [],
      repealedWithSuccessor: [rs('Perda No 1/2024')],
    });
    expect(d.responseState).toBe('successor_unretrieved');
    expect(d.answerNodes).toHaveLength(0);
    expect(d.successorLabel).toBe('Perda No 1/2024');
  });

  it('answers from RN nodes but gates them when there is no successor anywhere', () => {
    const rnNode = rn();
    const d = decideAnswer({
      liveMatches: [],
      successorLiveMatches: [],
      repealedNoSuccessor: [rnNode],
      repealedWithSuccessor: [],
    });
    expect(d.responseState).toBe('repealed_no_successor');
    expect(d.gated).toBe(true);
    expect(d.answerNodes).toEqual([rnNode]);
  });

  it('returns none when nothing relevant matched', () => {
    const d = decideAnswer({
      liveMatches: [], successorLiveMatches: [], repealedNoSuccessor: [], repealedWithSuccessor: [],
    });
    expect(d.responseState).toBe('none');
    expect(d.answerNodes).toHaveLength(0);
  });
});
