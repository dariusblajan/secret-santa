import { json, preflight } from '../_shared/cors.ts'
import { adminClient } from '../_shared/db.ts'
import { bucharestToDate } from '../_shared/time.ts'
import { sha256Hex } from '../_shared/tokens.ts'
import { normalizeParty, validateParty } from '../_shared/validation.ts'

type Db = ReturnType<typeof adminClient>

/**
 * Load a party by admin token. Deliberately selects only organizer-safe columns:
 * giftee_id, theme and token hashes are never returned.
 */
async function load(db: Db, adminHash: string) {
  const { data: party, error } = await db
    .from('parties')
    .select('id, name, event_at, location_name, budget_amount, locale, status, draw_version')
    .eq('admin_token_hash', adminHash)
    .maybeSingle()
  if (error) throw error
  if (!party) return null

  const { data: participants, error: pError } = await db
    .from('participants')
    .select('id, name, email, gender, is_organizer, invited_at, revealed_at')
    .eq('party_id', party.id)
    .order('position')
  if (pError) throw pError

  return {
    party: {
      id: party.id,
      name: party.name,
      eventAt: party.event_at,
      locationName: party.location_name,
      budgetAmount: party.budget_amount === null ? null : Number(party.budget_amount),
      locale: party.locale,
      status: party.status,
      drawVersion: party.draw_version,
    },
    participants: (participants ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      gender: p.gender,
      isOrganizer: p.is_organizer,
      invitedAt: p.invited_at,
      openedAt: p.revealed_at,
    })),
  }
}

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
  if (token.length < 20 || token.length > 200) return json(req, { code: 'not_found', message: 'Not found' }, 404)
  const adminHash = await sha256Hex(token)
  const db = adminClient()

  try {
    if (body.action === 'get') {
      const data = await load(db, adminHash)
      return data ? json(req, data) : json(req, { code: 'not_found', message: 'Not found' }, 404)
    }

    if (body.action === 'update') {
      const input = normalizeParty(body.party)
      const errors = validateParty(input)
      if (errors.length) return json(req, { code: 'validation_failed', message: 'Invalid input', errors }, 422)

      const { error } = await db.rpc('update_party_tx', {
        p_admin_hash: adminHash,
        p_party: {
          name: input.name,
          event_at: bucharestToDate(input.date, input.time)!.toISOString(),
          location_name: input.locationName,
          budget_amount: input.budgetAmount === null ? '' : String(input.budgetAmount),
          locale: input.locale,
        },
        p_participants: input.participants,
      })
      if (error) {
        if (error.message.includes('not_found')) return json(req, { code: 'not_found', message: 'Not found' }, 404)
        if (error.message.includes('locked')) return json(req, { code: 'locked', message: 'Party already started' }, 409)
        if (error.code === '23505') return json(req, { code: 'validation_failed', message: 'Duplicate email' }, 422)
        throw error
      }
      const data = await load(db, adminHash)
      return data ? json(req, data) : json(req, { code: 'not_found', message: 'Not found' }, 404)
    }

    return json(req, { code: 'bad_request', message: 'Unknown action' }, 400)
  } catch (err) {
    console.error('manage-party failed', err)
    return json(req, { code: 'server_error', message: 'Something went wrong' }, 500)
  }
})
