-- Iteration 1: parties and participants.
-- Security model: RLS is enabled with NO policies, so the anon/authenticated roles
-- cannot touch these tables directly. Only Edge Functions (service role) can.

create table public.parties (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  event_at timestamptz not null,
  location_name text not null check (char_length(location_name) between 1 and 120),
  budget_amount numeric(10, 2) check (budget_amount is null or budget_amount > 0),
  locale text not null default 'en' check (locale in ('en', 'ro')),
  same_gender_mode boolean not null default false,
  admin_token_hash text not null unique,
  status text not null default 'draft' check (status in ('draft', 'drawn')),
  draw_version int not null default 0,
  drawn_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  email text not null check (char_length(email) <= 254),
  gender text check (gender in ('girl', 'boy')),
  is_organizer boolean not null default false,
  position int not null default 0,
  -- Filled in later iterations (draw / reveal). Never exposed to the organizer.
  reveal_token_hash text unique,
  giftee_id uuid references public.participants (id) on delete set null,
  theme text,
  invited_at timestamptz,
  revealed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index participants_party_email_idx on public.participants (party_id, lower(email));
create unique index participants_one_organizer_idx on public.participants (party_id) where is_organizer;
create index participants_party_idx on public.participants (party_id);
create index parties_created_at_idx on public.parties (created_at);

alter table public.parties enable row level security;
alter table public.participants enable row level security;

revoke all on public.parties from anon, authenticated;
revoke all on public.participants from anon, authenticated;

-- Atomic create. p_participants is an ordered jsonb array of {name, email, gender};
-- the first element is the organizer.
create or replace function public.create_party_tx(
  p_party jsonb,
  p_participants jsonb,
  p_admin_hash text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into parties (name, event_at, location_name, budget_amount, locale, admin_token_hash)
  values (
    p_party ->> 'name',
    (p_party ->> 'event_at')::timestamptz,
    p_party ->> 'location_name',
    nullif(p_party ->> 'budget_amount', '')::numeric,
    p_party ->> 'locale',
    p_admin_hash
  )
  returning id into v_id;

  insert into participants (party_id, name, email, gender, is_organizer, position)
  select v_id, e ->> 'name', e ->> 'email', nullif(e ->> 'gender', ''), (o = 1), (o - 1)::int
  from jsonb_array_elements(p_participants) with ordinality as t (e, o);

  return v_id;
end;
$$;

-- Atomic update, only while the party is still a draft.
create or replace function public.update_party_tx(
  p_admin_hash text,
  p_party jsonb,
  p_participants jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party parties%rowtype;
begin
  select * into v_party from parties where admin_token_hash = p_admin_hash for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_party.status <> 'draft' then
    raise exception 'locked';
  end if;

  update parties
  set name = p_party ->> 'name',
      event_at = (p_party ->> 'event_at')::timestamptz,
      location_name = p_party ->> 'location_name',
      budget_amount = nullif(p_party ->> 'budget_amount', '')::numeric,
      locale = p_party ->> 'locale'
  where id = v_party.id;

  delete from participants where party_id = v_party.id;

  insert into participants (party_id, name, email, gender, is_organizer, position)
  select v_party.id, e ->> 'name', e ->> 'email', nullif(e ->> 'gender', ''), (o = 1), (o - 1)::int
  from jsonb_array_elements(p_participants) with ordinality as t (e, o);
end;
$$;

revoke all on function public.create_party_tx(jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.update_party_tx(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_party_tx(jsonb, jsonb, text) to service_role;
grant execute on function public.update_party_tx(text, jsonb, jsonb) to service_role;
