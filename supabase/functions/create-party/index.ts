import { sendEmail } from '../_shared/brevo.ts'
import { json, preflight } from '../_shared/cors.ts'
import { adminClient } from '../_shared/db.ts'
import { adminLinkEmail } from '../_shared/emails/admin_link.ts'
import { bucharestToDate } from '../_shared/time.ts'
import { generateToken, safeEqual, sha256Hex } from '../_shared/tokens.ts'
import { LIMITS, normalizeParty, validateParty } from '../_shared/validation.ts'

function adminUrl(token: string): string {
  const base = Deno.env.get('PUBLIC_APP_URL') ?? 'http://localhost:5173/'
  return `${base.endsWith('/') ? base : base + '/'}#/manage/${token}`
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

  // 1. Access code (the gate that protects the email quota)
  const expected = Deno.env.get('ACCESS_CODE')
  if (!expected) return json(req, { code: 'server_misconfigured', message: 'Access code not configured' }, 500)
  if (!(await safeEqual(typeof body.accessCode === 'string' ? body.accessCode : '', expected))) {
    return json(req, { code: 'invalid_access_code', message: 'Invalid access code' }, 403)
  }

  // 2. Validation (same rules as the browser)
  const input = normalizeParty(body.party)
  const errors = validateParty(input)
  if (errors.length) return json(req, { code: 'validation_failed', message: 'Invalid input', errors }, 422)

  const db = adminClient()

  // 3. Daily cap on new parties
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error: countError } = await db
    .from('parties')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since)
  if (countError) {
    console.error('count failed', countError)
    return json(req, { code: 'server_error', message: 'Something went wrong' }, 500)
  }
  if ((count ?? 0) >= LIMITS.maxPartiesPerDay) {
    return json(req, { code: 'daily_limit', message: 'Daily party limit reached' }, 429)
  }

  // 4. Create (atomic), storing only the hash of the admin token
  const eventAt = bucharestToDate(input.date, input.time)!.toISOString()
  const token = generateToken()
  const { error } = await db.rpc('create_party_tx', {
    p_party: {
      name: input.name,
      event_at: eventAt,
      location_name: input.locationName,
      budget_amount: input.budgetAmount === null ? '' : String(input.budgetAmount),
      locale: input.locale,
    },
    p_participants: input.participants,
    p_admin_hash: await sha256Hex(token),
  })
  if (error) {
    console.error('create_party_tx failed', error)
    const code = error.code === '23505' ? 'validation_failed' : 'server_error'
    return json(req, { code, message: 'Could not create the party' }, code === 'server_error' ? 500 : 422)
  }

  // 5. Email the admin link to the organizer (best effort: the UI also shows the link)
  const organizer = input.participants[0]
  const emailSent = await sendEmail({
    to: { email: organizer.email, name: organizer.name },
    ...adminLinkEmail({
      locale: input.locale,
      partyName: input.name,
      eventAt,
      locationName: input.locationName,
      adminUrl: adminUrl(token),
    }),
  })

  return json(req, { adminToken: token, emailSent })
})
