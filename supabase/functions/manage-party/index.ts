import { sendEmail } from '../_shared/brevo.ts'
import { json, preflight } from '../_shared/cors.ts'
import { adminClient } from '../_shared/db.ts'
import { checkDrawable, checkThemes, drawAssignments, type DrawExclusion, type DrawIssue } from '../_shared/draw.ts'
import { inviteEmail } from '../_shared/emails/invite.ts'
import { redoEmail } from '../_shared/emails/redo.ts'
import { serializeManage, type ExclusionRow, type ParticipantRow, type PartyRow } from '../_shared/serialize.ts'
import {
  dealThemes,
  newCustomThemeId,
  normalizeThemeLabel,
  parseCustomThemes,
  sanitizeThemeIds,
  validateCustomTheme,
} from '../_shared/themes.ts'
import { bucharestToDate } from '../_shared/time.ts'
import { generateToken, sha256Hex } from '../_shared/tokens.ts'
import { normalizeParty, validateParty } from '../_shared/validation.ts'

type Db = ReturnType<typeof adminClient>

// NOTE: giftee_id and theme are deliberately never selected here. The organizer must not see matches.
const PARTY_COLUMNS =
  'id, name, event_at, location_name, budget_amount, locale, status, draw_version, same_gender_mode, theme_ids, custom_themes'
const PARTICIPANT_COLUMNS = 'id, name, email, gender, is_organizer, invited_at, revealed_at'

function revealUrl(token: string): string {
  const base = Deno.env.get('PUBLIC_APP_URL') ?? 'http://localhost:5173/'
  return `${base.endsWith('/') ? base : base + '/'}#/reveal/${token}`
}

async function loadRows(db: Db, adminHash: string) {
  const { data: party, error } = await db
    .from('parties')
    .select(PARTY_COLUMNS)
    .eq('admin_token_hash', adminHash)
    .maybeSingle()
  if (error) throw error
  if (!party) return null

  const { data: participants, error: pError } = await db
    .from('participants')
    .select(PARTICIPANT_COLUMNS)
    .eq('party_id', party.id)
    .order('position')
  if (pError) throw pError
  const { data: exclusions, error: xError } = await db
    .from('party_exclusions')
    .select('giver_id, giftee_id')
    .eq('party_id', party.id)
    .order('created_at')
  if (xError) throw xError
  return {
    party: party as PartyRow,
    participants: (participants ?? []) as ParticipantRow[],
    exclusions: (exclusions ?? []) as ExclusionRow[],
  }
}

const toDrawExclusions = (rows: ExclusionRow[]): DrawExclusion[] =>
  rows.map((x) => ({ giverId: x.giver_id, gifteeId: x.giftee_id }))

async function load(db: Db, adminHash: string) {
  const rows = await loadRows(db, adminHash)
  return rows ? serializeManage(rows.party, rows.participants, rows.exclusions) : null
}

/**
 * Email one participant about the draw and record success. Returns whether it was sent.
 * First draw: invite with their private link. After a redo: the "draw was remade" email,
 * with a link only when a fresh token was just created (Resend); otherwise they use their original link.
 */
async function sendInvite(
  db: Db,
  party: PartyRow,
  recipient: { id: string; name: string; email: string },
  token: string | null,
  allNames: string[],
  remade: boolean,
): Promise<boolean> {
  const common = {
    locale: party.locale,
    recipientName: recipient.name,
    partyName: party.name,
    eventAt: party.event_at,
    locationName: party.location_name,
    budgetAmount: party.budget_amount === null ? null : Number(party.budget_amount),
    participantNames: allNames,
  }
  const content =
    remade || !token
      ? redoEmail({ ...common, revealUrl: token ? revealUrl(token) : undefined })
      : inviteEmail({ ...common, revealUrl: revealUrl(token) })
  const sent = await sendEmail({ to: { email: recipient.email, name: recipient.name }, ...content })
  if (sent) {
    await db.from('participants').update({ invited_at: new Date().toISOString() }).eq('id', recipient.id)
  }
  return sent
}

const notFound = (req: Request) => json(req, { code: 'not_found', message: 'Not found' }, 404)

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
  const adminHash = await sha256Hex(token)
  const db = adminClient()

  try {
    // ---- get -------------------------------------------------------------
    if (body.action === 'get') {
      const data = await load(db, adminHash)
      return data ? json(req, data) : notFound(req)
    }

    // ---- update party details / participants (draft only) -----------------
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
        if (error.message.includes('not_found')) return notFound(req)
        if (error.message.includes('locked')) return json(req, { code: 'locked', message: 'Party already started' }, 409)
        if (error.code === '23505') return json(req, { code: 'validation_failed', message: 'Duplicate email' }, 422)
        throw error
      }
      const data = await load(db, adminHash)
      return data ? json(req, data) : notFound(req)
    }

    // ---- set the theme pool (draft only) ----------------------------------
    if (body.action === 'set-themes') {
      const rows = await loadRows(db, adminHash)
      if (!rows) return notFound(req)
      // The theme pool stays editable after the start so the organizer can adjust it before a redo.
      const { error } = await db
        .from('parties')
        .update({ theme_ids: sanitizeThemeIds(body.themeIds, parseCustomThemes(rows.party.custom_themes)) })
        .eq('id', rows.party.id)
      if (error) throw error
      const data = await load(db, adminHash)
      return data ? json(req, data) : notFound(req)
    }

    // ---- add a custom theme (it joins the pool, selected) --------------------
    if (body.action === 'add-theme') {
      const rows = await loadRows(db, adminHash)
      if (!rows) return notFound(req)
      const custom = parseCustomThemes(rows.party.custom_themes)
      const label = normalizeThemeLabel(body.label)
      const problem = validateCustomTheme(label, custom)
      if (problem) return json(req, { code: problem, message: 'Invalid theme' }, 422)

      const added = { id: newCustomThemeId(), label }
      const { error } = await db
        .from('parties')
        .update({ custom_themes: [...custom, added], theme_ids: [...rows.party.theme_ids, added.id] })
        .eq('id', rows.party.id)
      if (error) throw error
      const data = await load(db, adminHash)
      return data ? json(req, data) : notFound(req)
    }

    // ---- remove a custom theme ---------------------------------------------
    if (body.action === 'remove-theme') {
      const rows = await loadRows(db, adminHash)
      if (!rows) return notFound(req)
      const custom = parseCustomThemes(rows.party.custom_themes)
      if (!custom.some((c) => c.id === body.themeId)) return notFound(req)

      // After the draw a dealt theme must stay readable on the reveal page until the next redo.
      const { count, error: usedError } = await db
        .from('participants')
        .select('id', { count: 'exact', head: true })
        .eq('party_id', rows.party.id)
        .eq('theme', body.themeId as string)
      if (usedError) throw usedError
      if (count) return json(req, { code: 'theme_in_use', message: 'Theme is dealt to someone' }, 409)

      const { error } = await db
        .from('parties')
        .update({
          custom_themes: custom.filter((c) => c.id !== body.themeId),
          theme_ids: rows.party.theme_ids.filter((id) => id !== body.themeId),
        })
        .eq('id', rows.party.id)
      if (error) throw error
      const data = await load(db, adminHash)
      return data ? json(req, data) : notFound(req)
    }

    // ---- exclusions: "giver can't buy for giftee" (draft or drawn) --------------
    if (body.action === 'add-exclusion') {
      const rows = await loadRows(db, adminHash)
      if (!rows) return notFound(req)
      const ids = new Set(rows.participants.map((p) => p.id))
      const giverId = body.giverId
      const gifteeId = body.gifteeId
      if (typeof giverId !== 'string' || typeof gifteeId !== 'string' || !ids.has(giverId) || !ids.has(gifteeId)) {
        return json(req, { code: 'validation_failed', message: 'Unknown participant' }, 422)
      }
      if (giverId === gifteeId) return json(req, { code: 'exclusion_self', message: 'Pick two different people' }, 422)
      if (rows.exclusions.some((x) => x.giver_id === giverId && x.giftee_id === gifteeId)) {
        return json(req, { code: 'exclusion_duplicate', message: 'Rule already exists' }, 422)
      }
      const { error } = await db
        .from('party_exclusions')
        .insert({ party_id: rows.party.id, giver_id: giverId, giftee_id: gifteeId })
      if (error) throw error
      const data = await load(db, adminHash)
      return data ? json(req, data) : notFound(req)
    }

    if (body.action === 'remove-exclusion') {
      const rows = await loadRows(db, adminHash)
      if (!rows) return notFound(req)
      const { error } = await db
        .from('party_exclusions')
        .delete()
        .eq('party_id', rows.party.id)
        .eq('giver_id', String(body.giverId))
        .eq('giftee_id', String(body.gifteeId))
      if (error) throw error
      const data = await load(db, adminHash)
      return data ? json(req, data) : notFound(req)
    }

    // ---- start the draw ----------------------------------------------------
    if (body.action === 'start') {
      const rows = await loadRows(db, adminHash)
      if (!rows) return notFound(req)
      const { party, participants, exclusions } = rows
      if (party.status !== 'draft') return json(req, { code: 'locked', message: 'Party already started' }, 409)

      const sameGender = body.sameGender === true
      const people = participants.map((p) => ({ id: p.id, name: p.name, gender: p.gender }))
      const custom = parseCustomThemes(party.custom_themes)
      const pool = sanitizeThemeIds(party.theme_ids, custom)
      const issues: DrawIssue[] = [...checkDrawable(people, sameGender, toDrawExclusions(exclusions)), ...checkThemes(pool.length, people.length)]
      if (issues.length > 0) return json(req, { code: 'cannot_start', message: 'Cannot start', issues }, 422)

      // Decide matches and themes. They exist only in memory and in the database.
      const giftees = drawAssignments(people, sameGender, toDrawExclusions(exclusions))
      const themes = dealThemes(pool, people.map((p) => p.id), custom)

      // Raw reveal tokens exist only until the emails are sent; the database keeps hashes.
      const tokens: Record<string, string> = {}
      const assignments = await Promise.all(
        people.map(async (p) => {
          tokens[p.id] = generateToken()
          return { id: p.id, giftee_id: giftees[p.id], theme: themes[p.id], token_hash: await sha256Hex(tokens[p.id]) }
        }),
      )

      const { error } = await db.rpc('start_draw_tx', {
        p_admin_hash: adminHash,
        p_same_gender: sameGender,
        p_assignments: assignments,
      })
      if (error) {
        if (error.message.includes('not_found')) return notFound(req)
        if (error.message.includes('locked')) return json(req, { code: 'locked', message: 'Party already started' }, 409)
        if (error.message.includes('conflict')) {
          return json(req, { code: 'conflict', message: 'Participants changed, please retry' }, 409)
        }
        throw error
      }

      // Send invites. A failure only leaves that person's invited_at empty (UI offers Resend).
      const allNames = participants.map((p) => p.name)
      await Promise.all(participants.map((p) => sendInvite(db, party, p, tokens[p.id], allNames, false)))

      const data = await load(db, adminHash)
      return data ? json(req, data) : notFound(req)
    }

    // ---- redo the draw (new matches and themes, same reveal links) ---------
    if (body.action === 'redo') {
      const rows = await loadRows(db, adminHash)
      if (!rows) return notFound(req)
      const { party, participants, exclusions } = rows
      if (party.status !== 'drawn') return json(req, { code: 'not_started', message: 'Party not started' }, 409)
      if (new Date(party.event_at).getTime() <= Date.now()) {
        return json(req, { code: 'event_passed', message: 'The event date has passed' }, 409)
      }

      const sameGender = body.sameGender === true
      const people = participants.map((p) => ({ id: p.id, name: p.name, gender: p.gender }))
      const custom = parseCustomThemes(party.custom_themes)
      const pool = sanitizeThemeIds(party.theme_ids, custom)
      const issues: DrawIssue[] = [...checkDrawable(people, sameGender, toDrawExclusions(exclusions)), ...checkThemes(pool.length, people.length)]
      if (issues.length > 0) return json(req, { code: 'cannot_start', message: 'Cannot redo', issues }, 422)

      const giftees = drawAssignments(people, sameGender, toDrawExclusions(exclusions))
      const themes = dealThemes(pool, people.map((p) => p.id), custom)
      const assignments = people.map((p) => ({ id: p.id, giftee_id: giftees[p.id], theme: themes[p.id] }))

      const { error } = await db.rpc('redo_draw_tx', {
        p_admin_hash: adminHash,
        p_same_gender: sameGender,
        p_assignments: assignments,
      })
      if (error) {
        if (error.message.includes('not_found')) return notFound(req)
        if (error.message.includes('not_started')) {
          return json(req, { code: 'not_started', message: 'Party not started' }, 409)
        }
        if (error.message.includes('event_passed')) {
          return json(req, { code: 'event_passed', message: 'The event date has passed' }, 409)
        }
        if (error.message.includes('conflict')) {
          return json(req, { code: 'conflict', message: 'Participants changed, please retry' }, 409)
        }
        throw error
      }

      // Everyone keeps their link, so the redo email carries no link. A failure leaves invited_at empty (Resend).
      const remadeParty = { ...party, draw_version: party.draw_version + 1 }
      const allNames = participants.map((p) => p.name)
      await Promise.all(participants.map((p) => sendInvite(db, remadeParty, p, null, allNames, true)))

      const data = await load(db, adminHash)
      return data ? json(req, data) : notFound(req)
    }

    // ---- resend one invite (rotates that person's link) -------------------
    if (body.action === 'resend') {
      const rows = await loadRows(db, adminHash)
      if (!rows) return notFound(req)
      const { party, participants } = rows
      if (party.status !== 'drawn') return json(req, { code: 'not_started', message: 'Party not started' }, 409)

      const target = participants.find((p) => p.id === body.participantId)
      if (!target) return notFound(req)

      const newToken = generateToken()
      const { error } = await db
        .from('participants')
        .update({ reveal_token_hash: await sha256Hex(newToken), invited_at: null })
        .eq('id', target.id)
        .eq('party_id', party.id)
      if (error) throw error

      await sendInvite(db, party, target, newToken, participants.map((p) => p.name), party.draw_version > 1)
      const data = await load(db, adminHash)
      return data ? json(req, data) : notFound(req)
    }

    return json(req, { code: 'bad_request', message: 'Unknown action' }, 400)
  } catch (err) {
    console.error('manage-party failed', err)
    return json(req, { code: 'server_error', message: 'Something went wrong' }, 500)
  }
})
