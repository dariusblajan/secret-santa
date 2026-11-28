-- Iteration 7: manual reminders. Informational "last sent" note per reminder kind, e.g.
-- {"countdown": "2026-12-10T09:00:00Z"}. All custom messages share the key "custom".
-- No history table and it never blocks a send.
alter table public.parties
  add column reminders_last_sent jsonb not null default '{}'::jsonb;
