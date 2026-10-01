/**
 * Legal-validity derivation for the chat RAG pipeline.
 *
 * Non-negotiable principle: validity is NEVER decided by the LLM. It is derived here, in
 * code, from the `work_relationships` table (via the `get_repeal_facts` RPC) and attached
 * to retrieval results deterministically. The model writes answer prose only.
 *
 * This module produces the three *per-work* states. The two remaining states are decided
 * by the route's answer-safety partition, not here:
 *   - `out_of_coverage`        — no node to tag (a register-only regulation is relevant).
 *   - `successor_unretrieved`  — a repealed work's in-corpus successor exists but did not
 *                                surface for this query, even after the scoped force-fetch.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type ValidityState =
  | 'live'
  | 'repealed_with_successor'
  | 'repealed_no_successor'
  | 'out_of_coverage'
  | 'successor_unretrieved';

export type ValidityInfo = {
  state: ValidityState;
  /**
   * The successor / repealer. `successorWorkId` is what the force-fetch scopes retrieval to.
   * There is no single "successor pasal" pointer: repeal is work-level and one successor
   * (e.g. Perda 1/2024) replaces many topics across many Pasal, so the live article is found
   * by scoped retrieval into `successorWorkId`, not by a stored pasal number.
   */
  repealedBy?: {
    successorWorkId?: number;
    number: string;
    year: number;
    label: string;
  };
};

type RepealFactRow = {
  work_id: number;
  successor_work_id: number | null;
  successor_register_id: number | null;
  successor_number: string | null;
  successor_year: number | null;
  successor_node_count: number | string | null;
};

/**
 * Derive validity for the given work ids in a single round-trip.
 *
 * Returns a map keyed by work_id. Works with no repeal edge are `live`. A repealed work whose
 * successor has text in the corpus is `repealed_with_successor` (the LLM will answer from the
 * successor, found via force-fetch on `repealedBy.successorWorkId`); otherwise the repeal is
 * known but no replacement text exists → `repealed_no_successor`.
 */
export async function tagValidity(
  workIds: number[],
  supabase: SupabaseClient,
): Promise<Map<number, ValidityInfo>> {
  const map = new Map<number, ValidityInfo>();
  const ids = Array.from(new Set(workIds.filter((id) => typeof id === 'number')));
  if (ids.length === 0) return map;

  // Default every requested work to live; repeal facts override below.
  for (const id of ids) map.set(id, { state: 'live' });

  const { data, error } = await supabase.rpc('get_repeal_facts', { work_ids: ids });
  if (error) {
    // Fail safe-ish for availability, but make the failure loud: validity could not be
    // determined, so do not silently claim everything is live without a trace.
    console.error('tagValidity: get_repeal_facts failed', error.message ?? error);
    return map;
  }

  for (const row of (data ?? []) as RepealFactRow[]) {
    const nodeCount = Number(row.successor_node_count ?? 0);
    const hasInCorpusSuccessor = row.successor_work_id != null && nodeCount > 0;
    const number = row.successor_number != null ? String(row.successor_number) : '?';
    const year = row.successor_year != null ? Number(row.successor_year) : 0;

    map.set(row.work_id, {
      state: hasInCorpusSuccessor ? 'repealed_with_successor' : 'repealed_no_successor',
      repealedBy: {
        successorWorkId: row.successor_work_id ?? undefined,
        number,
        year,
        label: `Perda No ${number}/${row.successor_year ?? '?'}`,
      },
    });
  }

  return map;
}

// --- Answer-safety partition (pure, deterministic, unit-tested) --------------------

export type MatchLike = { validity: ValidityInfo; [k: string]: unknown };

/** Group tagged matches by their work's validity state. */
export function classifyByValidity(matches: MatchLike[]) {
  return {
    live: matches.filter((m) => m.validity.state === 'live'),
    repealedWithSuccessor: matches.filter((m) => m.validity.state === 'repealed_with_successor'),
    repealedNoSuccessor: matches.filter((m) => m.validity.state === 'repealed_no_successor'),
  };
}

export type AnswerDisposition = {
  /** Nodes fed to the LLM. NEVER contains a dead repealed_with_successor node. */
  answerNodes: MatchLike[];
  /** repealed_no_successor — answer allowed but the UI must gate it. */
  gated: boolean;
  responseState: 'live' | 'repealed_no_successor' | 'successor_unretrieved' | 'none';
  /** Successor label for the successor_unretrieved notice (no dead content served). */
  successorLabel?: string;
};

/**
 * Decide what the model may answer from. This closes the "0 live nodes but an in-corpus
 * successor exists" hole: when a repealed work's successor exists but neither primary
 * retrieval nor the scoped force-fetch surfaced a live article, we return
 * `successor_unretrieved` with NO answer nodes — never the dead work's content.
 */
export function decideAnswer(args: {
  liveMatches: MatchLike[];
  successorLiveMatches: MatchLike[]; // live nodes from the force-fetch
  repealedNoSuccessor: MatchLike[];
  repealedWithSuccessor: MatchLike[];
}): AnswerDisposition {
  const { liveMatches, successorLiveMatches, repealedNoSuccessor, repealedWithSuccessor } = args;

  const answerNodes = [...liveMatches, ...successorLiveMatches];
  if (answerNodes.length > 0) {
    return { answerNodes, gated: false, responseState: 'live' };
  }
  if (repealedNoSuccessor.length > 0) {
    return { answerNodes: repealedNoSuccessor, gated: true, responseState: 'repealed_no_successor' };
  }
  if (repealedWithSuccessor.length > 0) {
    const successorLabel =
      repealedWithSuccessor[0].validity.repealedBy?.label || 'peraturan yang lebih baru';
    return { answerNodes: [], gated: false, responseState: 'successor_unretrieved', successorLabel };
  }
  return { answerNodes: [], gated: false, responseState: 'none' };
}
