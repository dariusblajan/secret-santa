// Pure TypeScript: shared by Edge Functions and the web app.
// Gift themes: a hint for the style of gift the giver buys. Labels are copy to proofread.
import { DrawError, shuffle } from './draw.ts'
import type { Locale } from './validation.ts'

export interface Theme {
  id: string
  en: string
  ro: string
}

export const THEMES: readonly Theme[] = [
  { id: 'cozy', en: 'Cozy', ro: 'Confortabil / de casă' },
  { id: 'sports', en: 'Sports', ro: 'Sport' },
  { id: 'kitchen', en: 'Kitchen', ro: 'Bucătărie' },
  { id: 'spa', en: 'Spa', ro: 'Spa' },
  { id: 'books', en: 'Books', ro: 'Cărți' },
  { id: 'tech', en: 'Tech gadget', ro: 'Gadget' },
  { id: 'plants', en: 'Plants', ro: 'Plante' },
  { id: 'board-games', en: 'Board games', ro: 'Jocuri de societate' },
  { id: 'coffee-tea', en: 'Coffee & tea', ro: 'Cafea și ceai' },
  { id: 'stationery', en: 'Stationery', ro: 'Papetărie' },
  { id: 'handmade', en: 'Handmade / DIY', ro: 'Lucru manual' },
  { id: 'outdoors', en: 'Outdoors', ro: 'Aer liber' },
  { id: 'sweets', en: 'Sweets & snacks', ro: 'Dulciuri și snacks-uri' },
  { id: 'music', en: 'Music', ro: 'Muzică' },
  { id: 'funny', en: 'Funny / gag', ro: 'Amuzant' },
  { id: 'decor', en: 'Home décor', ro: 'Decor' },
  { id: 'travel', en: 'Travel', ro: 'Călătorii' },
  { id: 'self-care', en: 'Self-care', ro: 'Grijă de sine' },
  { id: 'movie-night', en: 'Movie night', ro: 'Seară de film' },
  { id: 'red', en: 'Something red', ro: 'Ceva roșu' },
  { id: 'candles', en: 'Candles & scents', ro: 'Lumânări și parfumuri' },
  { id: 'art', en: 'Art & creativity', ro: 'Artă și creativitate' },
  { id: 'pets', en: 'Pets', ro: 'Animale de companie' },
  { id: 'wellness', en: 'Wellness', ro: 'Wellness' },
  { id: 'photography', en: 'Photography', ro: 'Fotografie' },
  { id: 'beauty', en: 'Beauty', ro: 'Frumusețe' },
  { id: 'fitness', en: 'Fitness', ro: 'Fitness' },
  { id: 'gourmet', en: 'Gourmet food', ro: 'Delicatese' },
  { id: 'wine', en: 'Wine & drinks', ro: 'Vin și băuturi' },
  { id: 'winter', en: 'Winter', ro: 'Iarnă' },
]

export const ALL_THEME_IDS: readonly string[] = THEMES.map((t) => t.id)

const BY_ID = new Map(THEMES.map((t) => [t.id, t]))

/** A theme typed by the organizer. One label, shown as-is in both languages. */
export interface CustomTheme {
  id: string
  label: string
}

export const CUSTOM_THEME_LIMITS = { maxCount: 20, maxLabelLength: 40 } as const
export const CUSTOM_THEME_PREFIX = 'c-'

export type CustomThemeError = 'theme_label_required' | 'theme_label_too_long' | 'theme_duplicate' | 'too_many_themes'

export function normalizeThemeLabel(label: unknown): string {
  return typeof label === 'string' ? label.replace(/\s+/g, ' ').trim() : ''
}

const key = (s: string) => s.toLocaleLowerCase()

/** Check a new custom label against the built-in names (both languages) and the existing custom ones. */
export function validateCustomTheme(label: string, existing: readonly CustomTheme[]): CustomThemeError | null {
  if (!label) return 'theme_label_required'
  if (label.length > CUSTOM_THEME_LIMITS.maxLabelLength) return 'theme_label_too_long'
  if (existing.length >= CUSTOM_THEME_LIMITS.maxCount) return 'too_many_themes'
  const k = key(label)
  if (THEMES.some((t) => key(t.en) === k || key(t.ro) === k) || existing.some((c) => key(c.label) === k)) {
    return 'theme_duplicate'
  }
  return null
}

export function newCustomThemeId(): string {
  return CUSTOM_THEME_PREFIX + crypto.randomUUID().replaceAll('-', '').slice(0, 10)
}

/** Read the stored jsonb defensively. */
export function parseCustomThemes(raw: unknown): CustomTheme[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((x) =>
    x && typeof x.id === 'string' && typeof x.label === 'string' ? [{ id: x.id, label: x.label }] : [],
  )
}

export function themeLabel(id: string, locale: Locale, custom: readonly CustomTheme[] = []): string {
  return custom.find((c) => c.id === id)?.label ?? BY_ID.get(id)?.[locale] ?? id
}

/**
 * Keep only known theme ids (built-in or this party's custom ones), without duplicates.
 * Built-ins keep their list order, custom themes follow in their creation order.
 */
export function sanitizeThemeIds(ids: unknown, custom: readonly CustomTheme[] = []): string[] {
  if (!Array.isArray(ids)) return []
  const wanted = new Set(ids.filter((x): x is string => typeof x === 'string'))
  return [...ALL_THEME_IDS, ...custom.map((c) => c.id)].filter((id) => wanted.has(id))
}

/**
 * Deal exactly one unique theme to each participant: shuffle the organizer's pool,
 * take as many as there are participants, hand them out in order.
 */
export function dealThemes(
  poolIds: readonly string[],
  participantIds: readonly string[],
  custom: readonly CustomTheme[] = [],
): Record<string, string> {
  const pool = sanitizeThemeIds([...poolIds], custom)
  if (pool.length < participantIds.length) {
    throw new DrawError([{ code: 'too_few_themes', needed: participantIds.length, selected: pool.length }])
  }
  const picked = shuffle(pool).slice(0, participantIds.length)
  const out: Record<string, string> = {}
  participantIds.forEach((id, i) => {
    out[id] = picked[i]
  })
  return out
}
