-- Iteration 5: directional matching exclusions ("giver can't buy for giftee").
-- Organizer input only; they never reveal a match.

create table public.party_exclusions (
  party_id uuid not null references public.parties (id) on delete cascade,
  giver_id uuid not null references public.participants (id) on delete cascade,
  giftee_id uuid not null references public.participants (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (party_id, giver_id, giftee_id),
  check (giver_id <> giftee_id)
);

alter table public.party_exclusions enable row level security;
revoke all on public.party_exclusions from anon, authenticated;
grant select, insert, update, delete on public.party_exclusions to service_role;

-- update_party_tx re-creates every participant row (new ids), so rules are carried over by email.
-- Rules that mention a removed participant (or one whose email changed) are dropped.
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
  v_kept jsonb;
begin
  select * into v_party from parties where admin_token_hash = p_admin_hash for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_party.status <> 'draft' then
    raise exception 'locked';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('giver', lower(g.email), 'giftee', lower(f.email))), '[]'::jsonb)
  into v_kept
  from party_exclusions x
  join participants g on g.id = x.giver_id
  join participants f on f.id = x.giftee_id
  where x.party_id = v_party.id;

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

  insert into party_exclusions (party_id, giver_id, giftee_id)
  select v_party.id, g.id, f.id
  from jsonb_array_elements(v_kept) as k
  join participants g on g.party_id = v_party.id and lower(g.email) = k ->> 'giver'
  join participants f on f.party_id = v_party.id and lower(f.email) = k ->> 'giftee'
  where g.id <> f.id;
end;
$$;

revoke all on function public.update_party_tx(text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.update_party_tx(text, jsonb, jsonb) to service_role;
