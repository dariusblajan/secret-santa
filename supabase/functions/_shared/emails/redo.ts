import { formatBudget, formatEventDateTime } from '../time.ts'
import type { Locale } from '../validation.ts'
import { escapeHtml } from './admin_link.ts'

export interface RedoData {
  locale: Locale
  recipientName: string
  partyName: string
  eventAt: string
  locationName: string
  budgetAmount: number | null
  participantNames: string[]
  /** Present only when the recipient got a fresh link (Resend). Otherwise they use their original link. */
  revealUrl?: string
}

const COPY = {
  en: {
    subject: (party: string) => `⚠️ The draw was remade. Please check your new match for ${party}`,
    heading: (name: string) => `Hi ${name}, the draw was remade ⚠️`,
    emphasis: 'Please disregard your previous match and theme. They are no longer valid.',
    withLink: 'Open your private link to see your new match and gift theme.',
    withoutLink:
      'Open the private link from your original invitation email to see your new match and gift theme. It still works, and it now shows the new result.',
    when: 'When',
    where: 'Where',
    budget: 'Budget',
    whosComing: "Who's coming",
    button: 'See my new match',
    warning: "This link is personal to you. Don't share it, and keep your match a secret!",
    fallback: 'If the button does not work, copy this address into your browser:',
  },
  ro: {
    subject: (party: string) => `⚠️ Extragerea a fost refăcută. Verifică noua ta potrivire pentru ${party}`,
    heading: (name: string) => `Salut, ${name}! Extragerea a fost refăcută ⚠️`,
    emphasis: 'Ignoră potrivirea și tema primite înainte. Nu mai sunt valabile.',
    withLink: 'Deschide linkul tău privat ca să vezi noua potrivire și noua temă a cadoului.',
    withoutLink:
      'Deschide linkul privat din emailul inițial de invitație ca să vezi noua potrivire și noua temă a cadoului. Linkul funcționează în continuare și arată acum noul rezultat.',
    when: 'Când',
    where: 'Unde',
    budget: 'Buget',
    whosComing: 'Cine vine',
    button: 'Vezi noua potrivire',
    warning: 'Acest link este personal. Nu îl da mai departe și păstrează secretul!',
    fallback: 'Dacă butonul nu funcționează, copiază această adresă în browser:',
  },
} as const

export function redoEmail(d: RedoData): { subject: string; html: string; text: string } {
  const c = COPY[d.locale]
  const when = formatEventDateTime(d.eventAt, d.locale)
  const budget = d.budgetAmount === null ? null : formatBudget(d.budgetAmount, d.locale)
  const names = d.participantNames.join(', ')
  const intro = d.revealUrl ? c.withLink : c.withoutLink

  const html = `<!doctype html>
<html lang="${d.locale}">
  <body style="font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 520px; margin: 0 auto; padding: 24px;">
    <h1 style="font-size: 20px;">${escapeHtml(c.heading(d.recipientName))}</h1>
    <p style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 12px; font-weight: 600;">${c.emphasis}</p>
    <p>${intro}</p>
    <p>
      <strong>${escapeHtml(d.partyName)}</strong><br>
      <strong>${c.when}:</strong> ${escapeHtml(when)}<br>
      <strong>${c.where}:</strong> ${escapeHtml(d.locationName)}${
        budget ? `<br><strong>${c.budget}:</strong> ${escapeHtml(budget)}` : ''
      }<br>
      <strong>${c.whosComing}:</strong> ${escapeHtml(names)}
    </p>${
      d.revealUrl
        ? `
    <p><a href="${escapeHtml(d.revealUrl)}" style="display: inline-block; background: #b91c1c; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none;">${c.button}</a></p>
    <p style="color: #6b7280; font-size: 12px;">${c.fallback}<br>${escapeHtml(d.revealUrl)}</p>`
        : ''
    }
    <p style="color: #6b7280; font-size: 14px;">${c.warning}</p>
  </body>
</html>`

  const text = [
    c.heading(d.recipientName),
    '',
    c.emphasis,
    '',
    intro,
    '',
    d.partyName,
    `${c.when}: ${when}`,
    `${c.where}: ${d.locationName}`,
    ...(budget ? [`${c.budget}: ${budget}`] : []),
    `${c.whosComing}: ${names}`,
    ...(d.revealUrl ? ['', d.revealUrl] : []),
    '',
    c.warning,
  ].join('\n')

  return { subject: c.subject(d.partyName), html, text }
}
