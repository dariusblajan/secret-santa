import { isoToBucharestParts } from '../../../supabase/functions/_shared/time.ts'
import type { Gender, Locale, PartyInput } from '../../../supabase/functions/_shared/validation.ts'
import type { ManageData } from './api'

export interface ParticipantFormValues {
  name: string
  email: string
  gender: Gender | ''
}

export interface PartyFormValues {
  name: string
  date: string
  time: string
  locationName: string
  budget: string
  locale: Locale
  participants: ParticipantFormValues[]
}

export function emptyPartyForm(locale: Locale): PartyFormValues {
  return {
    name: '',
    date: '',
    time: '',
    locationName: '',
    budget: '',
    locale,
    participants: [{ name: '', email: '', gender: '' }],
  }
}

export function formFromManageData(data: ManageData): PartyFormValues {
  const { date, time } = isoToBucharestParts(data.party.eventAt)
  return {
    name: data.party.name,
    date,
    time,
    locationName: data.party.locationName,
    budget: data.party.budgetAmount === null ? '' : String(data.party.budgetAmount),
    locale: data.party.locale,
    participants: data.participants.map((p) => ({ name: p.name, email: p.email, gender: p.gender ?? '' })),
  }
}

export function toPartyInput(form: PartyFormValues): PartyInput {
  const budgetText = form.budget.trim().replace(',', '.')
  return {
    name: form.name.trim(),
    date: form.date,
    time: form.time,
    locationName: form.locationName.trim(),
    // Number('abc') is NaN: validation reports it as invalid_budget before anything is sent.
    budgetAmount: budgetText === '' ? null : Number(budgetText),
    locale: form.locale,
    participants: form.participants.map((p) => ({
      name: p.name.trim(),
      email: p.email.trim().toLowerCase(),
      gender: p.gender === '' ? null : p.gender,
    })),
  }
}
