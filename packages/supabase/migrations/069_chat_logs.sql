-- Migration 069: Add chat_logs table with 90-day retention
--
-- Server-side log of user chat questions, with PII scrubbing flag. This table
-- is intended for analytics and query understanding. Only the service-role client
-- (which bypasses RLS) writes to this table; anon/authenticated users have zero
-- access. A scheduled cron job purges logs older than 90 days.

create extension if not exists pg_cron;

create table if not exists chat_logs (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  session_hash   text,
  query_raw      text not null,
  query_refined  text,
  response_state text,
  pii_scrubbed   boolean not null default false
);

create index if not exists chat_logs_created_at_idx on chat_logs (created_at desc);

alter table chat_logs enable row level security;
-- Intentionally NO policies: only the service-role client (bypasses RLS) touches
-- this table. anon / authenticated get zero access.

select cron.schedule(
  'chat_logs_purge',
  '17 3 * * *',
  $$delete from chat_logs where created_at < now() - interval '90 days'$$
);
