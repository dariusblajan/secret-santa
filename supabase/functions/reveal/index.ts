import { json, preflight } from '../_shared/cors.ts'
import { adminClient } from '../_shared/db.ts'
import { sha256Hex } from '../_shared/tokens.ts'

const notFound = (req: Request) => json(req, { code: 'not_found', message: 'Not found' }, 404)

/**
 * Returns ONLY the data belonging to the owner of the reveal token:
 * their own giftee and theme, plus the shared party details and participant names.
 */
Deno.serve(async (req) => {
  const early = preflight(req)
  if (early) return early
  if (req.method !== 'POST') return json(req, { code: 'method_not_allowed', message: 'Use POST' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json(req, { code: 'bad_request', message: 'Invalid JSON' }, 400)
  }

  const token = typeof body.token === 'string' ? body.token : ''
  if (token.length < 20 || token.length > 200) return notFound(req)

  const db = adminClient()
  try {
    const { data: me, error } = await db
      .from('participants')
      .select('id, name, party_id, giftee_id, theme, revealed_at')
      .eq('reveal_token_hash', await sha256Hex(token))
      .maybeSingle()
    if (error) throw error
    if (!me || !me.giftee_id) return notFound(req)

    const [{ data: party }, { data: giftee }, { data: everyone }] = await Promise.all([
      db
        .from('parties')
        .select('name, event_at, location_name, budget_amount, locale, status, draw_version')
        .eq('id', me.party_id)
        .single(),
      db.from('participants').select('name').eq('id', me.giftee_id).single(),
      db.from('participants').select('name').eq('party_id', me.party_id).order('position'),
    ])
    if (!party || !giftee || party.status !== 'drawn') return notFound(req)

    // Record that this person opened their link (the organizer only ever sees this flag).
    if (!me.revealed_at) {
      await db.from('participants').update({ revealed_at: new Date().toISOString() }).eq('id', me.id)
    }

    return json(req, {
      party: {
        name: party.name,
        eventAt: party.event_at,
        locationName: party.location_name,
        budgetAmount: party.budget_amount === null ? null : Number(party.budget_amount),
        locale: party.locale,
      },
      you: me.name,
      giftee: giftee.name,
      themeId: me.theme,
      participantNames: (everyone ?? []).map((p) => p.name),
      drawVersion: party.draw_version,
      remade: party.draw_version > 1,
    })
  } catch (err) {
    console.error('reveal failed', err)
    return json(req, { code: 'server_error', message: 'Something went wrong' }, 500)
  }
})
