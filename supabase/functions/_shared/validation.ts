// Pure TypeScript (no dependencies): shared by Edge Functions and the web app,
// so the browser and the server apply exactly the same rules.
import { bucharestToDate, isValidDateString, isValidTimeString } from './time.ts'

export const LIMITS = {
  maxParticipants: 15,
  minParticipantsToStart: 3,
  maxPartiesPerDay: 5,
  nameMax: 80,
  locationMax: 120,
  emailMax: 254,
  budgetMax: 100000,
} as const

export type Locale = 'en' | 'ro'
export type Gender = 'girl' | 'boy'

export interface ParticipantInput {
  name: string
  email: string
  gender: Gender | null
}

export interface PartyInput {
  name: string
  date: string // YYYY-MM-DD, Romanian time
  time: string // HH:mm, Romanian time
  locationName: string
  budgetAmount: number | null
  locale: Locale
  participants: ParticipantInput[] // first one is the organizer
}

export type ValidationCode =
  | 'required'
  | 'too_long'
  | 'invalid_email'
  | 'duplicate_email'
  | 'invalid_date'
  | 'invalid_time'
  | 'past_event'
  | 'invalid_budget'
  | 'invalid_gender'
  | 'invalid_locale'
  | 'too_many_participants'

export interface ValidationError {
  field: string
  code: ValidationCode
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Coerce untrusted input into a PartyInput shape (trimmed, emails lowercased). Does not validate. */
export function normalizeParty(raw: unknown): PartyInput {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const participants = Array.isArray(r.participants) ? r.participants : []
  return {
    name: str(r.name),
    date: str(r.date),
    time: str(r.time),
    locationName: str(r.locationName),
    budgetAmount: typeof r.budgetAmount === 'number' ? r.budgetAmount : null,
    locale: r.locale as Locale,
    participants: participants.map((p) => {
      const pr = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>
      const gender = pr.gender === 'girl' || pr.gender === 'boy' ? pr.gender : pr.gender ? ('invalid' as Gender) : null
      return { name: str(pr.name), email: str(pr.email).toLowerCase(), gender }
    }),
  }
}

export function validateParty(input: PartyInput, now: Date = new Date()): ValidationError[] {
  const errors: ValidationError[] = []
  const add = (field: string, code: ValidationCode) => errors.push({ field, code })

  if (!input.name) add('name', 'required')
  else if (input.name.length > LIMITS.nameMax) add('name', 'too_long')

  if (!input.locationName) add('locationName', 'required')
  else if (input.locationName.length > LIMITS.locationMax) add('locationName', 'too_long')

  if (input.locale !== 'en' && input.locale !== 'ro') add('locale', 'invalid_locale')

  // Date and time
  let dateOk = false
  let timeOk = false
  if (!input.date) add('date', 'required')
  else if (!isValidDateString(input.date)) add('date', 'invalid_date')
  else dateOk = true
  if (!input.time) add('time', 'required')
  else if (!isValidTimeString(input.time)) add('time', 'invalid_time')
  else timeOk = true
  if (dateOk && timeOk) {
    const when = bucharestToDate(input.date, input.time)
    if (!when || when.getTime() <= now.getTime()) add('date', 'past_event')
  }

  // Budget (optional)
  if (input.budgetAmount !== null) {
    if (!Number.isFinite(input.budgetAmount) || input.budgetAmount <= 0 || input.budgetAmount > LIMITS.budgetMax) {
      add('budgetAmount', 'invalid_budget')
    }
  }

  // Participants
  if (input.participants.length === 0) add('participants', 'required')
  if (input.participants.length > LIMITS.maxParticipants) add('participants', 'too_many_participants')

  const seen = new Map<string, number>()
  input.participants.forEach((p, i) => {
    const base = `participants.${i}`
    if (!p.name) add(`${base}.name`, 'required')
    else if (p.name.length > LIMITS.nameMax) add(`${base}.name`, 'too_long')

    if (!p.email) add(`${base}.email`, 'required')
    else if (p.email.length > LIMITS.emailMax) add(`${base}.email`, 'too_long')
    else if (!EMAIL_RE.test(p.email)) add(`${base}.email`, 'invalid_email')
    else {
      const key = p.email.toLowerCase()
      const first = seen.get(key)
      if (first === undefined) seen.set(key, i)
      else {
        add(`${base}.email`, 'duplicate_email')
      }
    }

    if (p.gender !== null && p.gender !== 'girl' && p.gender !== 'boy') add(`${base}.gender`, 'invalid_gender')
  })

  return errors
}
