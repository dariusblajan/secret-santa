import { formatEventDateTime } from '../time.ts'
import type { Locale } from '../validation.ts'

export interface AdminLinkData {
  locale: Locale
  partyName: string
  eventAt: string
  locationName: string
  adminUrl: string
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const COPY = {
  en: {
    subject: (party: string) => `Your organizer link for "${party}"`,
    heading: (party: string) => `Your party "${party}" is created 🎁`,
    when: 'When',
    where: 'Where',
    intro: 'Use this private link to manage your party: edit details, add participants and (soon) start the draw.',
    button: 'Open the manage page',
    warning:
      'Keep this link private. Anyone who has it can manage the party. It never shows who got whom, even to you.',
    fallback: 'If the button does not work, copy this address into your browser:',
  },
  ro: {
    subject: (party: string) => `Linkul tău de organizator pentru „${party}”`,
    heading: (party: string) => `Petrecerea „${party}” a fost creată 🎁`,
    when: 'Când',
    where: 'Unde',
    intro:
      'Folosește acest link privat ca să îți gestionezi petrecerea: modifici detaliile, adaugi participanți și (în curând) pornești extragerea.',
    button: 'Deschide pagina de administrare',
    warning:
      'Păstrează acest link privat. Oricine îl are poate administra petrecerea. Nu arată niciodată cine pe cine a tras, nici măcar ție.',
    fallback: 'Dacă butonul nu funcționează, copiază această adresă în browser:',
  },
} as const

export function adminLinkEmail(d: AdminLinkData): { subject: string; html: string; text: string } {
  const c = COPY[d.locale]
  const when = formatEventDateTime(d.eventAt, d.locale)
  const html = `<!doctype html>
<html lang="${d.locale}">
  <body style="font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 520px; margin: 0 auto; padding: 24px;">
    <h1 style="font-size: 20px;">${escapeHtml(c.heading(d.partyName))}</h1>
    <p><strong>${c.when}:</strong> ${escapeHtml(when)}<br><strong>${c.where}:</strong> ${escapeHtml(d.locationName)}</p>
    <p>${c.intro}</p>
    <p><a href="${escapeHtml(d.adminUrl)}" style="display: inline-block; background: #b91c1c; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none;">${c.button}</a></p>
    <p style="color: #6b7280; font-size: 14px;">${c.warning}</p>
    <p style="color: #6b7280; font-size: 12px;">${c.fallback}<br>${escapeHtml(d.adminUrl)}</p>
  </body>
</html>`
  const text = [
    c.heading(d.partyName),
    '',
    `${c.when}: ${when}`,
    `${c.where}: ${d.locationName}`,
    '',
    c.intro,
    '',
    d.adminUrl,
    '',
    c.warning,
  ].join('\n')
  return { subject: c.subject(d.partyName), html, text }
}
