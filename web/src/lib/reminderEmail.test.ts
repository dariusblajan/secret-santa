import { describe, expect, it } from 'vitest'
import {
  normalizeCustomMessage,
  REMINDER_KINDS,
  reminderEmail,
  validateCustomMessage,
} from '../../../supabase/functions/_shared/emails/reminder.ts'
import { daysUntilEvent } from '../../../supabase/functions/_shared/time.ts'

const base = {
  recipientName: 'Ana <b>',
  partyName: 'Party',
  eventAt: '2027-12-20T18:00:00.000Z',
  locationName: 'Café',
  budgetAmount: 20,
  daysLeft: 7,
  gifteeName: 'Bob',
  themeLabel: 'Cozy',
  customMessage: 'Hot chocolate on me.\n\nSee you <soon>',
}

// Words that would make a reminder sound like a scam or a threat.
const URGENT = /urgent|last chance|act now|hurry|final|asap|immediately|expire|deadline|!!|⚠|🚨/i

describe('reminderEmail', () => {
  it('shows a plain day count and the party details in every kind and language', () => {
    for (const locale of ['en', 'ro'] as const) {
      for (const kind of REMINDER_KINDS) {
        const mail = reminderEmail({ ...base, kind, locale })
        expect(mail.text, `${kind}/${locale}`).toContain(locale === 'en' ? 'Days left: 7' : 'Zile rămase: 7')
        expect(mail.text).toContain('Café')
        expect(mail.text).toContain('20')
      }
    }
  })

  it('has no urgent or alarming wording', () => {
    for (const locale of ['en', 'ro'] as const) {
      for (const kind of REMINDER_KINDS) {
        const mail = reminderEmail({ ...base, kind, locale })
        expect(mail.subject + mail.text, `${kind}/${locale}`).not.toMatch(URGENT)
      }
    }
  })

  it('uses the theme and giftee where promised', () => {
    expect(reminderEmail({ ...base, kind: 'theme', locale: 'en' }).subject).toContain('Cozy')
    const match = reminderEmail({ ...base, kind: 'match', locale: 'ro' })
    expect(match.text).toContain('Bob')
    expect(match.text).toContain('Cozy')
    expect(reminderEmail({ ...base, kind: 'countdown', locale: 'en' }).text).not.toContain('Bob')
  })

  it('escapes names and custom messages', () => {
    const mail = reminderEmail({ ...base, kind: 'custom', locale: 'en' })
    expect(mail.html).toContain('Ana &lt;b&gt;')
    expect(mail.html).toContain('See you &lt;soon&gt;')
    expect(mail.html).not.toContain('<soon>')
    expect(mail.html.match(/<p>/g)?.length).toBeGreaterThanOrEqual(3)
  })
})

describe('custom message validation', () => {
  it('normalizes and validates', () => {
    expect(normalizeCustomMessage('  hi\r\nthere ')).toBe('hi\nthere')
    expect(validateCustomMessage('')).toBe('required')
    expect(validateCustomMessage('x'.repeat(1001))).toBe('too_long')
    expect(validateCustomMessage('ok')).toBeNull()
  })
})

describe('daysUntilEvent', () => {
  it('counts Romanian calendar days', () => {
    const now = new Date('2027-12-13T10:00:00Z')
    expect(daysUntilEvent('2027-12-20T18:00:00Z', now)).toBe(7)
    expect(daysUntilEvent('2027-12-13T20:00:00Z', now)).toBe(0)
    // 22:30 UTC is already the next day in Romania (UTC+2).
    expect(daysUntilEvent('2027-12-13T22:30:00Z', now)).toBe(1)
  })
})
