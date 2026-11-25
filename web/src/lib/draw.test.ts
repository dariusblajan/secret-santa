import { describe, expect, it } from 'vitest'
import {
  checkDrawable,
  checkThemes,
  DrawError,
  drawAssignments,
  type DrawParticipant,
} from '../../../supabase/functions/_shared/draw.ts'
import { inviteEmail } from '../../../supabase/functions/_shared/emails/invite.ts'
import { serializeManage, type ParticipantRow, type PartyRow } from '../../../supabase/functions/_shared/serialize.ts'
import {
  ALL_THEME_IDS,
  normalizeThemeLabel,
  validateCustomTheme,
  dealThemes,
  sanitizeThemeIds,
  THEMES,
  themeLabel,
} from '../../../supabase/functions/_shared/themes.ts'

function people(n: number, genders: Array<'girl' | 'boy' | null> = []): DrawParticipant[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Person ${i}`, gender: genders[i] ?? null }))
}

/** True when following giver -> giftee from any start visits everyone exactly once. */
function isSingleCycle(map: Record<string, string>, ids: string[]): boolean {
  let current = ids[0]
  const seen = new Set<string>()
  while (!seen.has(current)) {
    seen.add(current)
    current = map[current]
  }
  return seen.size === ids.length && current === ids[0]
}

describe('drawAssignments (mixed)', () => {
  it('gives everyone exactly one giftee, never themselves, in a single cycle (n = 3..15)', () => {
    for (let n = 3; n <= 15; n++) {
      const ps = people(n)
      const ids = ps.map((p) => p.id)
      for (let run = 0; run < 200; run++) {
        const map = drawAssignments(ps, false)
        expect(Object.keys(map).sort()).toEqual([...ids].sort())
        expect(Object.values(map).sort()).toEqual([...ids].sort()) // everyone receives exactly once
        for (const [giver, giftee] of Object.entries(map)) expect(giftee).not.toBe(giver)
        expect(isSingleCycle(map, ids)).toBe(true)
        // no mutual swaps for 3+ people
        for (const [giver, giftee] of Object.entries(map)) expect(map[giftee]).not.toBe(giver)
      }
    }
  })

  it('is actually random (all 2 possible cycles of 3 people appear)', () => {
    const seen = new Set<string>()
    const ps = people(3)
    for (let i = 0; i < 300; i++) seen.add(JSON.stringify(Object.entries(drawAssignments(ps, false)).sort()))
    expect(seen.size).toBe(2)
  })

  it('10 000 random runs always produce a valid permutation', () => {
    const ps = people(8)
    const ids = ps.map((p) => p.id)
    for (let i = 0; i < 10000; i++) {
      const map = drawAssignments(ps, false)
      expect(new Set(Object.values(map)).size).toBe(ids.length)
      for (const [g, r] of Object.entries(map)) if (g === r) throw new Error('self match')
    }
  })

  it('rejects fewer than 3 participants', () => {
    expect(() => drawAssignments(people(2), false)).toThrow(DrawError)
    expect(checkDrawable(people(2), false)).toEqual([{ code: 'too_few_participants', min: 3, count: 2 }])
  })
})

describe('drawAssignments (same gender)', () => {
  const mix: Array<'girl' | 'boy'> = ['girl', 'girl', 'girl', 'boy', 'boy', 'boy', 'boy']

  it('only matches within the same gender', () => {
    const ps = people(7, mix)
    for (let run = 0; run < 300; run++) {
      const map = drawAssignments(ps, true)
      for (const [giver, giftee] of Object.entries(map)) {
        expect(ps.find((p) => p.id === giver)!.gender).toBe(ps.find((p) => p.id === giftee)!.gender)
        expect(giftee).not.toBe(giver)
      }
    }
  })

  it('allows groups of exactly 2 (forced mutual swap)', () => {
    const ps = people(4, ['girl', 'girl', 'boy', 'boy'])
    const map = drawAssignments(ps, true)
    expect(map.p0).toBe('p1')
    expect(map.p1).toBe('p0')
    expect(map.p2).toBe('p3')
    expect(map.p3).toBe('p2')
  })

  it('blocks a group of 1', () => {
    const ps = people(4, ['girl', 'girl', 'girl', 'boy'])
    expect(checkDrawable(ps, true)).toEqual([{ code: 'group_too_small', gender: 'boy' }])
    expect(() => drawAssignments(ps, true)).toThrow(DrawError)
  })

  it('blocks missing genders and names them', () => {
    const ps = people(4, ['girl', 'girl', null, 'boy'])
    expect(checkDrawable(ps, true)).toEqual([{ code: 'missing_gender', names: ['Person 2'] }])
  })

  it('does not require genders in mixed mode', () => {
    expect(checkDrawable(people(4), false)).toEqual([])
  })
})

describe('themes', () => {
  it('ships about 30 unique themes with both languages', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(30)
    expect(new Set(ALL_THEME_IDS).size).toBe(THEMES.length)
    for (const t of THEMES) {
      expect(t.en.trim()).not.toBe('')
      expect(t.ro.trim()).not.toBe('')
    }
    expect(themeLabel('cozy', 'en')).toBe('Cozy')
    expect(themeLabel('cozy', 'ro')).toBe('Confortabil / de casă')
  })

  it('deals exactly one unique theme per participant from the pool', () => {
    const pool = ALL_THEME_IDS.slice(0, 10)
    const ids = people(6).map((p) => p.id)
    for (let run = 0; run < 200; run++) {
      const dealt = dealThemes(pool, ids)
      const values = Object.values(dealt)
      expect(Object.keys(dealt).sort()).toEqual([...ids].sort())
      expect(new Set(values).size).toBe(ids.length)
      for (const v of values) expect(pool).toContain(v)
    }
  })

  it('uses every theme when the pool equals the party size', () => {
    const pool = ALL_THEME_IDS.slice(0, 5)
    const dealt = dealThemes(pool, people(5).map((p) => p.id))
    expect(new Set(Object.values(dealt))).toEqual(new Set(pool))
  })

  it('fails when the pool is too small', () => {
    expect(() => dealThemes(ALL_THEME_IDS.slice(0, 3), people(4).map((p) => p.id))).toThrow(DrawError)
    expect(checkThemes(3, 4)).toEqual([{ code: 'too_few_themes', needed: 4, selected: 3 }])
    expect(checkThemes(4, 4)).toEqual([])
  })

  it('drops unknown and duplicate ids', () => {
    expect(sanitizeThemeIds(['cozy', 'cozy', 'nope', 42, 'spa'])).toEqual(['cozy', 'spa'])
    expect(sanitizeThemeIds('cozy')).toEqual([])
  })
})

describe('organizer response never contains matches', () => {
  const party: PartyRow = {
    id: 'party',
    name: 'Party',
    event_at: '2026-12-18T17:00:00Z',
    location_name: 'Café',
    budget_amount: '20.00',
    locale: 'en',
    status: 'drawn',
    draw_version: 1,
    same_gender_mode: false,
    theme_ids: ['cozy', 'spa'],
    admin_token_hash: 'secret-hash',
  }
  const rows: ParticipantRow[] = [
    {
      id: 'a',
      name: 'Ana',
      email: 'ana@example.com',
      gender: 'girl',
      is_organizer: true,
      invited_at: null,
      revealed_at: null,
      giftee_id: 'b',
      theme: 'cozy',
      reveal_token_hash: 'hash-a',
    },
  ]

  it('drops giftee, theme and token hashes even if the row contains them', () => {
    const out = serializeManage(party, rows)
    const json = JSON.stringify(out)
    expect(json).not.toContain('giftee')
    expect(json).not.toContain('hash')
    expect(json).not.toContain('secret-hash')
    for (const p of out.participants) expect(Object.keys(p)).not.toContain('theme')
    expect(out.party.budgetAmount).toBe(20)
  })
})

describe('invite email', () => {
  const data = {
    locale: 'en' as const,
    recipientName: 'Ana <script>',
    partyName: 'Office & Co',
    eventAt: '2026-12-18T17:00:00Z',
    locationName: 'Café "Roma"',
    budgetAmount: 20,
    participantNames: ['Ana <script>', 'Mihai'],
    revealUrl: 'https://example.github.io/secret-santa/#/reveal/abc',
  }

  it('escapes HTML and includes the reveal link but no match', () => {
    const { html, text, subject } = inviteEmail(data)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('Office &amp; Co')
    expect(html).toContain(data.revealUrl)
    expect(text).toContain(data.revealUrl)
    expect(subject).toContain('Office & Co')
  })

  it('renders in Romanian with parentheses for gendered words', () => {
    const { subject } = inviteEmail({ ...data, locale: 'ro' })
    expect(subject).toContain('invitat(ă)')
  })

  it('omits the budget line when there is none', () => {
    expect(inviteEmail({ ...data, budgetAmount: null }).text).not.toContain('Budget')
  })
})

describe('custom themes', () => {
  const custom = [
    { id: 'c-1', label: 'Pottery' },
    { id: 'c-2', label: 'Origami' },
  ]

  it('keeps custom ids in the pool and drops unknown ones', () => {
    expect(sanitizeThemeIds(['c-2', 'cozy', 'c-9', 'nope'], custom)).toEqual(['cozy', 'c-2'])
    expect(sanitizeThemeIds(['c-1'])).toEqual([])
  })

  it('deals custom themes uniquely together with built-ins', () => {
    const ids = people(5).map((p) => p.id)
    const pool = ['cozy', 'sports', 'c-1', 'c-2', 'books']
    for (let run = 0; run < 200; run++) {
      const dealt = dealThemes(pool, ids, custom)
      expect(new Set(Object.values(dealt))).toEqual(new Set(pool))
    }
  })

  it('shows the same label in both languages', () => {
    expect(themeLabel('c-1', 'en', custom)).toBe('Pottery')
    expect(themeLabel('c-1', 'ro', custom)).toBe('Pottery')
  })

  it('validates labels', () => {
    expect(normalizeThemeLabel('  Hand   made ')).toBe('Hand made')
    expect(validateCustomTheme('', custom)).toBe('theme_label_required')
    expect(validateCustomTheme('x'.repeat(41), custom)).toBe('theme_label_too_long')
    expect(validateCustomTheme('pottery', custom)).toBe('theme_duplicate')
    expect(validateCustomTheme('cozy', custom)).toBe('theme_duplicate')
    expect(validateCustomTheme('Cărți', custom)).toBe('theme_duplicate')
    expect(validateCustomTheme('Knitting', custom)).toBeNull()
    expect(validateCustomTheme('Knitting', Array.from({ length: 20 }, (_, i) => ({ id: `c-${i}`, label: `T${i}` })))).toBe(
      'too_many_themes',
    )
  })
})
