import { formatBudget, formatEventDateTime } from '../time.ts'
import type { Locale } from '../validation.ts'
import { escapeHtml } from './admin_link.ts'

/**
 * Manual reminders. Tone: warm, optimistic, encouraging. Never urgent, never guilt-tripping:
 * no "last chance" / "act now" wording, no all-caps, no alarm emojis.
 *
 * To add a preset: add its id to REMINDER_PRESETS and one entry to PRESETS below (en + ro copy).
 */
export const REMINDER_PRESETS = ['countdown', 'theme', 'match'] as const
export type ReminderPreset = (typeof REMINDER_PRESETS)[number]
export type ReminderKind = ReminderPreset | 'custom'

export const REMINDER_KINDS: readonly ReminderKind[] = [...REMINDER_PRESETS, 'custom']
export const CUSTOM_MESSAGE_MAX = 1000

export function isReminderKind(value: unknown): value is ReminderKind {
  return typeof value === 'string' && (REMINDER_KINDS as readonly string[]).includes(value)
}

export function normalizeCustomMessage(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : ''
}

export function validateCustomMessage(message: string): 'required' | 'too_long' | null {
  if (!message) return 'required'
  return message.length > CUSTOM_MESSAGE_MAX ? 'too_long' : null
}

export interface ReminderData {
  kind: ReminderKind
  locale: Locale
  recipientName: string
  partyName: string
  eventAt: string
  locationName: string
  budgetAmount: number | null
  /** Calendar days until the party, computed when sending. */
  daysLeft: number
  /** Needed by `match`. */
  gifteeName?: string
  /** Display label of the recipient's theme. Needed by `theme` and `match`. */
  themeLabel?: string
  /** Needed by `custom`. */
  customMessage?: string
}

/** A paragraph is plain text and bold parts. Everything is escaped when rendered. */
type Segment = string | { b: string }
type Paragraph = Segment[]

interface PresetCopy {
  subject: (d: ReminderData) => string
  body: (d: ReminderData) => Paragraph[]
}

const PRESETS: Record<ReminderPreset, Record<Locale, PresetCopy>> = {
  countdown: {
    en: {
      subject: (d) => `Countdown to ${d.partyName} 🎄`,
      body: (d) => [
        [`${d.partyName} is coming up, and there's still plenty of time to find something lovely.`],
        ["We're looking forward to seeing you!"],
      ],
    },
    ro: {
      subject: (d) => `Numărătoarea inversă pentru ${d.partyName} 🎄`,
      body: (d) => [
        [`Se apropie ${d.partyName} și mai este timp berechet să găsești ceva frumos.`],
        ['Abia așteptăm să ne vedem!'],
      ],
    },
  },
  theme: {
    en: {
      subject: (d) => `Your gift theme is ${d.themeLabel} ✨`,
      body: (d) => [
        ['Your gift theme is ', { b: d.themeLabel ?? '' }, ". There's no wrong answer here, so have fun with it and follow your imagination."],
      ],
    },
    ro: {
      subject: (d) => `Tema cadoului tău este ${d.themeLabel} ✨`,
      body: (d) => [
        ['Tema cadoului tău este ', { b: d.themeLabel ?? '' }, '. Nu există răspuns greșit, așa că distrează-te și lasă imaginația să te ghideze.'],
      ],
    },
  },
  match: {
    en: {
      subject: () => 'Your Secret Santa is waiting for a gift 🎁',
      body: (d) => [
        ["You're picking a gift for ", { b: d.gifteeName ?? '' }, '. Theme: ', { b: d.themeLabel ?? '' }, '.'],
        ['A thoughtful little something goes a long way.'],
      ],
    },
    ro: {
      subject: () => 'Cineva special așteaptă cadoul tău 🎁',
      body: (d) => [
        ['Alegi un cadou pentru ', { b: d.gifteeName ?? '' }, '. Tema: ', { b: d.themeLabel ?? '' }, '.'],
        ['Un gest mărunt, făcut cu grijă, înseamnă mult.'],
      ],
    },
  },
}

const CUSTOM: Record<Locale, { subject: (party: string) => string }> = {
  en: { subject: (party) => `A note about ${party}` },
  ro: { subject: (party) => `Un mesaj despre ${party}` },
}

const COPY = {
  en: {
    greeting: (name: string) => `Hi ${name}!`,
    daysLeft: 'Days left',
    when: 'When',
    where: 'Where',
    budget: 'Budget',
    reveal: 'Your private link from the invitation email has all the details.',
    secret: 'Keep your match a secret!',
  },
  ro: {
    greeting: (name: string) => `Salut, ${name}!`,
    daysLeft: 'Zile rămase',
    when: 'Când',
    where: 'Unde',
    budget: 'Buget',
    reveal: 'Linkul tău privat din emailul de invitație are toate detaliile.',
    secret: 'Păstrează secretul!',
  },
} as const

const paragraphText = (p: Paragraph) => p.map((s) => (typeof s === 'string' ? s : s.b)).join('')
const paragraphHtml = (p: Paragraph) =>
  p.map((s) => (typeof s === 'string' ? escapeHtml(s) : `<strong>${escapeHtml(s.b)}</strong>`)).join('')

export function reminderEmail(d: ReminderData): { subject: string; html: string; text: string } {
  const c = COPY[d.locale]
  const when = formatEventDateTime(d.eventAt, d.locale)
  const budget = d.budgetAmount === null ? null : formatBudget(d.budgetAmount, d.locale)

  let subject: string
  let paragraphs: Paragraph[]
  if (d.kind === 'custom') {
    subject = CUSTOM[d.locale].subject(d.partyName)
    paragraphs = (d.customMessage ?? '').split(/\n{2,}/).map((block) => [block.trim()] as Paragraph).filter((p) => p[0])
  } else {
    const copy = PRESETS[d.kind][d.locale]
    subject = copy.subject(d)
    paragraphs = copy.body(d)
  }
  const personal = d.kind === 'theme' || d.kind === 'match'

  const info: [string, string][] = [
    [c.daysLeft, String(d.daysLeft)],
    [c.when, when],
    [c.where, d.locationName],
    ...(budget ? ([[c.budget, budget]] as [string, string][]) : []),
  ]

  const html = `<!doctype html>
<html lang="${d.locale}">
  <body style="font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 520px; margin: 0 auto; padding: 24px;">
    <h1 style="font-size: 20px;">${escapeHtml(c.greeting(d.recipientName))}</h1>
${paragraphs.map((p) => `    <p>${paragraphHtml(p).replaceAll('\n', '<br>')}</p>`).join('\n')}
    <p>
      <strong>${escapeHtml(d.partyName)}</strong><br>
${info.map(([k, v]) => `      <strong>${k}:</strong> ${escapeHtml(v)}`).join('<br>\n')}
    </p>${
      personal
        ? `
    <p style="color: #6b7280; font-size: 14px;">${c.reveal} ${c.secret}</p>`
        : ''
    }
  </body>
</html>`

  const text = [
    c.greeting(d.recipientName),
    '',
    ...paragraphs.flatMap((p) => [paragraphText(p), '']),
    d.partyName,
    ...info.map(([k, v]) => `${k}: ${v}`),
    ...(personal ? ['', `${c.reveal} ${c.secret}`] : []),
  ].join('\n')

  return { subject, html, text }
}
