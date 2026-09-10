import 'server-only';
import { createHash } from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { scrubPii } from '@/lib/pii-scrub';

export type ChatLogInput = {
  query: string;
  refinedQuery?: string;
  responseState?: string;
  sessionId?: string;
};

export type ChatLogRow = {
  session_hash: string | null;
  query_raw: string;
  query_refined: string | null;
  response_state: string | null;
  pii_scrubbed: boolean;
};

let warnedNoSalt = false;

export function buildChatLogRow(input: ChatLogInput, salt: string | undefined): ChatLogRow {
  const { text, scrubbed } = scrubPii(input.query ?? '');
  let sessionHash: string | null = null;
  if (input.sessionId && salt) {
    sessionHash = createHash('sha256').update(input.sessionId + salt).digest('hex');
  } else if (input.sessionId && !salt && !warnedNoSalt) {
    warnedNoSalt = true;
    console.warn('[chat:log] CHAT_LOG_SALT unset — storing null session_hash');
  }
  return {
    session_hash: sessionHash,
    query_raw: text,
    query_refined: input.refinedQuery?.trim() || null,
    response_state: input.responseState?.trim() || null,
    pii_scrubbed: scrubbed,
  };
}

export async function logChatQuery(input: ChatLogInput): Promise<void> {
  try {
    const row = buildChatLogRow(input, process.env.CHAT_LOG_SALT);
    const supabase = createServiceClient();
    const { error } = await supabase.from('chat_logs').insert(row);
    if (error) console.warn('[chat:log] insert failed:', error.message);
  } catch (err: any) {
    console.warn('[chat:log] unexpected:', err?.message ?? err);
  }
}
