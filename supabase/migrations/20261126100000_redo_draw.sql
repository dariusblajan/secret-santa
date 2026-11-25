-- Iteration 3: atomic "redo draw". Replaces matches and themes, keeps every reveal token.
-- p_assignments is a jsonb array of {id, giftee_id, theme}, one entry per participant.

create or replace function public.redo_draw_tx(
  p_admin_hash text,
  p_same_gender boolean,
  p_assignments jsonb
) returns int
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
  if v_party.status <> 'drawn' then
    raise exception 'not_started';
  end if;
  if v_party.event_at <= now() then
    raise exception 'event_passed';
  end if;

  select count(*) into v_expected from participants where party_id = v_party.id;
  if jsonb_array_length(p_assignments) <> v_expected then
    raise exception 'conflict';
  end if;

  -- invited_at is cleared: it now tracks whether the redo email reached the person.
  update participants p
  set giftee_id = (a ->> 'giftee_id')::uuid,
      theme = a ->> 'theme',
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
  set same_gender_mode = p_same_gender,
      draw_version = draw_version + 1,
      drawn_at = now()
  where id = v_party.id;

  return v_party.draw_version + 1;
end;
$$;

revoke all on function public.redo_draw_tx(text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.redo_draw_tx(text, boolean, jsonb) to service_role;
