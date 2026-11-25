-- Iteration 2: theme pool on the party, and the atomic "start draw" function.

alter table public.parties add column theme_ids text[] not null default '{}';

-- Same signature as before; now also stores the selected theme pool.
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
  insert into parties (name, event_at, location_name, budget_amount, locale, theme_ids, admin_token_hash)
  values (
    p_party ->> 'name',
    (p_party ->> 'event_at')::timestamptz,
    p_party ->> 'location_name',
    nullif(p_party ->> 'budget_amount', '')::numeric,
    p_party ->> 'locale',
    coalesce(array(select jsonb_array_elements_text(p_party -> 'theme_ids')), '{}'),
    p_admin_hash
  )
  returning id into v_id;

  insert into participants (party_id, name, email, gender, is_organizer, position)
  select v_id, e ->> 'name', e ->> 'email', nullif(e ->> 'gender', ''), (o = 1), (o - 1)::int
  from jsonb_array_elements(p_participants) with ordinality as t (e, o);

  return v_id;
end;
$$;

-- Atomically performs the draw. p_assignments is a jsonb array of
-- {id, giftee_id, theme, token_hash}, one entry per participant.
-- Only works once: the party must still be a draft. Only token HASHES are stored.
create or replace function public.start_draw_tx(
  p_admin_hash text,
  p_same_gender boolean,
  p_assignments jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party parties%rowtype;
  v_expected int;
  v_updated int;
begin
  select * into v_party from parties where admin_token_hash = p_admin_hash for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_party.status <> 'draft' then
    raise exception 'locked';
  end if;

  select count(*) into v_expected from participants where party_id = v_party.id;
  if jsonb_array_length(p_assignments) <> v_expected then
    raise exception 'conflict';
  end if;

  update participants p
  set giftee_id = (a ->> 'giftee_id')::uuid,
      theme = a ->> 'theme',
      reveal_token_hash = a ->> 'token_hash',
      invited_at = null,
      revealed_at = null
  from jsonb_array_elements(p_assignments) as a
  where p.id = (a ->> 'id')::uuid
    and p.party_id = v_party.id;

  get diagnostics v_updated = row_count;
  if v_updated <> v_expected then
    raise exception 'conflict';
  end if;

  update parties
  set status = 'drawn',
      same_gender_mode = p_same_gender,
      draw_version = draw_version + 1,
      drawn_at = now()
  where id = v_party.id;
end;
$$;

revoke all on function public.create_party_tx(jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.start_draw_tx(text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.create_party_tx(jsonb, jsonb, text) to service_role;
grant execute on function public.start_draw_tx(text, boolean, jsonb) to service_role;
