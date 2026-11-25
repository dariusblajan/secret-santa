-- Iteration 4: organizer-defined themes, stored per party as [{id, label}].
alter table public.parties add column custom_themes jsonb not null default '[]'::jsonb;
