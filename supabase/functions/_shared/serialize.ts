// Pure TypeScript. Builds the organizer-facing response with an explicit WHITELIST of fields,
// so match data (giftee, theme) can never leak to the organizer even if a row contains it.

import { parseCustomThemes } from './themes.ts'

export interface PartyRow {
  id: string
  name: string
  event_at: string
  location_name: string
  budget_amount: number | string | null
  locale: 'en' | 'ro'
  status: 'draft' | 'drawn'
  draw_version: number
  same_gender_mode: boolean
  theme_ids: string[]
  custom_themes?: unknown
  [key: string]: unknown
}

export interface ParticipantRow {
  id: string
  name: string
  email: string
  gender: 'girl' | 'boy' | null
  is_organizer: boolean
  invited_at: string | null
  revealed_at: string | null
  [key: string]: unknown
}

export function serializeManage(party: PartyRow, participants: ParticipantRow[]) {
  return {
    party: {
      id: party.id,
      name: party.name,
      eventAt: party.event_at,
      locationName: party.location_name,
      budgetAmount: party.budget_amount === null ? null : Number(party.budget_amount),
      locale: party.locale,
      status: party.status,
      drawVersion: party.draw_version,
      sameGender: party.same_gender_mode,
      themeIds: party.theme_ids,
      customThemes: parseCustomThemes(party.custom_themes),
    },
    participants: participants.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      gender: p.gender,
      isOrganizer: p.is_organizer,
      invitedAt: p.invited_at,
      openedAt: p.revealed_at,
    })),
  }
}
