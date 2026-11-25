import { formatBudget, formatEventDateTime } from '../time.ts'
import type { Locale } from '../validation.ts'
import { escapeHtml } from './admin_link.ts'

export interface InviteData {
  locale: Locale
  recipientName: string
  partyName: string
  eventAt: string
  locationName: string
  budgetAmount: number | null
  participantNames: string[]
  revealUrl: string
}

const COPY = {
  en: {
    subject: (party: string) => `You're invited to ${party}! Your Secret Santa match inside`,
    heading: (name: string, party: string) => `Hi ${name}, you're invited to ${party} 🎁`,
    intro:
      "The Secret Santa draw is done. Open your private link to find out who you're buying a gift for, and your gift theme.",
    when: 'When',
    where: 'Where',
    budget: 'Budget',
    whosComing: "Who's coming",
    button: 'Reveal my match',
    warning: "This link is personal to you. Don't share it, and keep your match a secret!",
    fallback: 'If the button does not work, copy this address into your browser:',
  },
  ro: {
    subject: (party: string) => `Ești invitat(ă) la ${party}! Află pe cine ai tras`,
    heading: (name: string, party: string) => `Salut, ${name}! Ești invitat(ă) la ${party} 🎁`,
    intro:
      'Extragerea Secret Santa s-a făcut. Deschide linkul tău privat ca să afli pentru cine cumperi un cadou și care este tema cadoului tău.',
    when: 'Când',
    where: 'Unde',
    budget: 'Buget',
    whosComing: 'Cine vine',
    button: 'Află cine ți-a ieșit',
    warning: 'Acest link este personal. Nu îl da mai departe și păstrează secretul!',
    fallback: 'Dacă butonul nu funcționează, copiază această adresă în browser:',
  },
} as const

export function inviteEmail(d: InviteData): { subject: string; html: string; text: string } {
  const c = COPY[d.locale]
  const when = formatEventDateTime(d.eventAt, d.locale)
  const budget = d.budgetAmount === null ? null : formatBudget(d.budgetAmount, d.locale)
  const names = d.participantNames.join(', ')

  const html = `<!doctype html>
<html lang="${d.locale}">
  <body style="font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 520px; margin: 0 auto; padding: 24px;">
    <h1 style="font-size: 20px;">${escapeHtml(c.heading(d.recipientName, d.partyName))}</h1>
    <p>${c.intro}</p>
    <p>
      <strong>${c.when}:</strong> ${escapeHtml(when)}<br>
      <strong>${c.where}:</strong> ${escapeHtml(d.locationName)}${
        budget ? `<br><strong>${c.budget}:</strong> ${escapeHtml(budget)}` : ''
      }<br>
      <strong>${c.whosComing}:</strong> ${escapeHtml(names)}
    </p>
    <p><a href="${escapeHtml(d.revealUrl)}" style="display: inline-block; background: #b91c1c; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none;">${c.button}</a></p>
    <p style="color: #6b7280; font-size: 14px;">${c.warning}</p>
    <p style="color: #6b7280; font-size: 12px;">${c.fallback}<br>${escapeHtml(d.revealUrl)}</p>
  </body>
</html>`

  const text = [
    c.heading(d.recipientName, d.partyName),
    '',
    c.intro,
    '',
    `${c.when}: ${when}`,
    `${c.where}: ${d.locationName}`,
    ...(budget ? [`${c.budget}: ${budget}`] : []),
    `${c.whosComing}: ${names}`,
    '',
    d.revealUrl,
    '',
    c.warning,
  ].join('\n')

  return { subject: c.subject(d.partyName), html, text }
}
