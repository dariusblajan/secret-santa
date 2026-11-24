import { describe, expect, it } from 'vitest'
import {
  bucharestToDate,
  formatBudget,
  isoToBucharestParts,
  isValidDateString,
} from '../../../supabase/functions/_shared/time.ts'
import {
  LIMITS,
  normalizeParty,
  validateParty,
  type PartyInput,
} from '../../../supabase/functions/_shared/validation.ts'

const NOW = new Date('2026-11-24T10:00:00Z')

function validParty(overrides: Partial<PartyInput> = {}): PartyInput {
  return {
    name: 'Office Party',
    date: '2026-12-18',
    time: '19:00',
    locationName: 'Café Roma',
    budgetAmount: 20,
    locale: 'en',
    participants: [
      { name: 'Darius', email: 'darius@example.com', gender: null },
      { name: 'Ana', email: 'ana@example.com', gender: 'girl' },
      { name: 'Mihai', email: 'mihai@example.com', gender: 'boy' },
    ],
    ...overrides,
  }
}

const codes = (p: PartyInput) => validateParty(p, NOW).map((e) => `${e.field}:${e.code}`)

describe('validateParty', () => {
  it('accepts a valid party', () => {
    expect(codes(validParty())).toEqual([])
  })

  it('requires name, location, date and time', () => {
    expect(codes(validParty({ name: '', locationName: '', date: '', time: '' }))).toEqual([
      'name:required',
      'locationName:required',
      'date:required',
      'time:required',
    ])
  })

  it('rejects events in the past', () => {
    expect(codes(validParty({ date: '2026-11-23' }))).toContain('date:past_event')
    // Same day but earlier than now (10:00 UTC = 12:00 in Romania)
    expect(codes(validParty({ date: '2026-11-24', time: '11:00' }))).toContain('date:past_event')
    expect(codes(validParty({ date: '2026-11-24', time: '13:00' }))).toEqual([])
  })

  it('rejects impossible dates and times', () => {
    expect(codes(validParty({ date: '2026-02-31' }))).toContain('date:invalid_date')
    expect(codes(validParty({ time: '25:00' }))).toContain('time:invalid_time')
  })

  it('validates the optional budget', () => {
    expect(codes(validParty({ budgetAmount: null }))).toEqual([])
    expect(codes(validParty({ budgetAmount: 0 }))).toContain('budgetAmount:invalid_budget')
    expect(codes(validParty({ budgetAmount: -5 }))).toContain('budgetAmount:invalid_budget')
    expect(codes(validParty({ budgetAmount: Number.NaN }))).toContain('budgetAmount:invalid_budget')
  })

  it('validates emails and detects duplicates case-insensitively', () => {
    const p = validParty()
    p.participants[1].email = 'not-an-email'
    p.participants[2].email = 'DARIUS@example.com'.toLowerCase()
    expect(codes(p)).toEqual(['participants.1.email:invalid_email', 'participants.2.email:duplicate_email'])
  })

  it('caps participants at the limit', () => {
    const many = Array.from({ length: LIMITS.maxParticipants + 1 }, (_, i) => ({
      name: `P${i}`,
      email: `p${i}@example.com`,
      gender: null,
    }))
    expect(codes(validParty({ participants: many }))).toContain('participants:too_many_participants')
    expect(codes(validParty({ participants: many.slice(0, LIMITS.maxParticipants) }))).toEqual([])
  })

  it('rejects an unknown language', () => {
    expect(codes(validParty({ locale: 'fr' as 'en' }))).toContain('locale:invalid_locale')
  })
})

describe('normalizeParty', () => {
  it('trims, lowercases emails and survives garbage', () => {
    const p = normalizeParty({
      name: '  Party ',
      participants: [{ name: ' A ', email: ' A@X.COM ', gender: 'girl' }, 42, { gender: 'alien' }],
    })
    expect(p.name).toBe('Party')
    expect(p.participants[0]).toEqual({ name: 'A', email: 'a@x.com', gender: 'girl' })
    expect(p.participants[2].gender).toBe('invalid')
    expect(normalizeParty(null).participants).toEqual([])
  })
})

describe('Romanian time helpers', () => {
  it('converts winter time (UTC+2) and summer time (UTC+3)', () => {
    expect(bucharestToDate('2026-12-18', '19:00')?.toISOString()).toBe('2026-12-18T17:00:00.000Z')
    expect(bucharestToDate('2026-07-01', '19:00')?.toISOString()).toBe('2026-07-01T16:00:00.000Z')
  })

  it('round-trips through the Romanian wall clock', () => {
    const iso = bucharestToDate('2026-12-31', '23:30')!.toISOString()
    expect(isoToBucharestParts(iso)).toEqual({ date: '2026-12-31', time: '23:30' })
  })

  it('validates date strings', () => {
    expect(isValidDateString('2026-02-28')).toBe(true)
    expect(isValidDateString('2026-02-30')).toBe(false)
    expect(isValidDateString('18/12/2026')).toBe(false)
  })

  it('formats budgets by language currency', () => {
    expect(formatBudget(20, 'en')).toContain('$')
    expect(formatBudget(100, 'ro')).toMatch(/RON|lei/)
  })
})
