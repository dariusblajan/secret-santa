import { sendEmail } from '../_shared/brevo.ts'
import { json, preflight } from '../_shared/cors.ts'
import { adminClient } from '../_shared/db.ts'
import {
  isReminderKind,
  normalizeCustomMessage,
  reminderEmail,
  validateCustomMessage,
} from '../_shared/emails/reminder.ts'
import { parseCustomThemes, themeLabel } from '../_shared/themes.ts'
import { daysUntilEvent } from '../_shared/time.ts'
import { sha256Hex } from '../_shared/tokens.ts'

const notFound = (req: Request) => json(req, { code: 'not_found', message: 'Not found' }, 404)

/**
 * Manual reminder, one email per participant (so matches and themes never pass through the organizer).
 * Body: { token, kind: 'countdown' | 'theme' | 'match' | 'custom', customMessage? }
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
  if (!isReminderKind(body.kind)) return json(req, { code: 'bad_request', message: 'Unknown reminder' }, 400)
  const kind = body.kind

  const customMessage = normalizeCustomMessage(body.customMessage)
  if (kind === 'custom') {
    const problem = validateCustomMessage(customMessage)
    if (problem) return json(req, { code: `message_${problem}`, message: 'Invalid message' }, 422)
  }

  const db = adminClient()
  try {
    const { data: party, error } = await db
      .from('parties')
      .select('id, name, event_at, location_name, budget_amount, locale, status, custom_themes, reminders_last_sent')
      .eq('admin_token_hash', await sha256Hex(token))
      .maybeSingle()
    if (error) throw error
    if (!party) return notFound(req)
    if (party.status !== 'drawn') return json(req, { code: 'not_started', message: 'Party not started' }, 409)
    if (new Date(party.event_at).getTime() <= Date.now()) {
      return json(req, { code: 'event_passed', message: 'The event date has passed' }, 409)
    }

    const { data: participants, error: pError } = await db
      .from('participants')
      .select('id, name, email, giftee_id, theme')
      .eq('party_id', party.id)
      .order('position')
    if (pError) throw pError

    const people = participants ?? []
    const nameById = new Map(people.map((p) => [p.id, p.name]))
    const custom = parseCustomThemes(party.custom_themes)
    const daysLeft = daysUntilEvent(party.event_at)

    const results = await Promise.all(
      people.map((p) =>
        sendEmail({
          to: { email: p.email, name: p.name },
          ...reminderEmail({
            kind,
            locale: party.locale,
            recipientName: p.name,
            partyName: party.name,
            eventAt: party.event_at,
            locationName: party.location_name,
            budgetAmount: party.budget_amount === null ? null : Number(party.budget_amount),
            daysLeft,
            gifteeName: p.giftee_id ? nameById.get(p.giftee_id) : undefined,
            themeLabel: p.theme ? themeLabel(p.theme, party.locale, custom) : undefined,
            customMessage,
          }),
        }),
      ),
    )
    const sent = results.filter(Boolean).length

    const last = { ...(party.reminders_last_sent as Record<string, string>) }
    if (sent > 0) {
      last[kind] = new Date().toISOString()
      const { error: uError } = await db.from('parties').update({ reminders_last_sent: last }).eq('id', party.id)
      if (uError) throw uError
    }

    return json(req, { sent, failed: results.length - sent, remindersLastSent: last })
  } catch (err) {
    console.error('send-reminder failed', err)
    return json(req, { code: 'server_error', message: 'Something went wrong' }, 500)
  }
})
