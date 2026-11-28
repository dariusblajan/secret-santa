// Pure TypeScript (no Deno/DOM-only APIs): shared by Edge Functions and the web app.
// All parties live in Romanian time.

export const PARTY_TIME_ZONE = 'Europe/Bucharest'

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: PARTY_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function partsAt(utcMs: number) {
  const parts = formatter.formatToParts(new Date(utcMs))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

/** Offset of Europe/Bucharest from UTC, in milliseconds, at the given instant. */
function offsetMs(utcMs: number): number {
  const p = partsAt(utcMs)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

export function isValidDateString(date: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const probe = new Date(Date.UTC(y, mo - 1, d))
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d
}

export function isValidTimeString(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
}

/** Interpret a wall-clock date ("YYYY-MM-DD") and time ("HH:mm") as Romanian time. */
export function bucharestToDate(date: string, time: string): Date | null {
  if (!isValidDateString(date) || !isValidTimeString(time)) return null
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  const naive = Date.UTC(y, mo - 1, d, h, mi)
  // Two passes so the offset is evaluated near the correct instant (handles DST changes).
  let ts = naive - offsetMs(naive)
  ts = naive - offsetMs(ts)
  return new Date(ts)
}

/** The Romanian wall-clock date and time of an instant, as form-friendly strings. */
export function isoToBucharestParts(iso: string): { date: string; time: string } {
  const p = partsAt(new Date(iso).getTime())
  const pad = (n: number) => String(n).padStart(2, '0')
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` }
}

/** Today's date in Romania as "YYYY-MM-DD" (used for the date picker's min). */
export function todayInBucharest(now: Date = new Date()): string {
  return isoToBucharestParts(now.toISOString()).date
}

/** Whole calendar days from `now` to the event, both read as Romanian dates (0 on the day itself). */
export function daysUntilEvent(eventAtIso: string, now: Date = new Date()): number {
  const toDay = (iso: string) => {
    const [y, m, d] = isoToBucharestParts(iso).date.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((toDay(eventAtIso) - toDay(now.toISOString())) / 86_400_000)
}

export function dateLocaleTag(locale: 'en' | 'ro'): string {
  return locale === 'ro' ? 'ro-RO' : 'en-GB'
}

/** e.g. "Friday, 18 December 2026 at 19:00" in the party's language, Romanian time. */
export function formatEventDateTime(iso: string, locale: 'en' | 'ro'): string {
  return new Intl.DateTimeFormat(dateLocaleTag(locale), {
    timeZone: PARTY_TIME_ZONE,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(iso))
}

export const CURRENCY_BY_LOCALE = { en: 'USD', ro: 'RON' } as const

export function formatBudget(amount: number, locale: 'en' | 'ro'): string {
  return new Intl.NumberFormat(locale === 'ro' ? 'ro-RO' : 'en-US', {
    style: 'currency',
    currency: CURRENCY_BY_LOCALE[locale],
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount)
}
