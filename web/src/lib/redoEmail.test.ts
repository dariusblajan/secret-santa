import { describe, expect, it } from 'vitest'
import { redoEmail } from '../../../supabase/functions/_shared/emails/redo.ts'

const base = {
  recipientName: 'Ana <b>',
  partyName: 'Party',
  eventAt: '2027-12-20T18:00:00.000Z',
  locationName: 'Café',
  budgetAmount: 20,
  participantNames: ['Ana', 'Bob', 'Cleo'],
}

describe('redoEmail', () => {
  it('emphasises the remake and has no link without a fresh token', () => {
    const mail = redoEmail({ ...base, locale: 'en' })
    expect(mail.subject).toContain('remade')
    expect(mail.text).toContain('disregard your previous match')
    expect(mail.text).toContain('original invitation')
    expect(mail.html).not.toContain('#/reveal/')
  })

  it('includes the new link when one is given, and escapes names', () => {
    const mail = redoEmail({ ...base, locale: 'ro', revealUrl: 'https://x.test/#/reveal/abc' })
    expect(mail.text).toContain('https://x.test/#/reveal/abc')
    expect(mail.html).toContain('Ana &lt;b&gt;')
    expect(mail.subject).toContain('refăcută')
  })
})
