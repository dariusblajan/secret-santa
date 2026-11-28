import type { DrawIssue } from '../../../supabase/functions/_shared/draw.ts'
import type { CustomTheme } from '../../../supabase/functions/_shared/themes.ts'
import type { ReminderKind } from '../../../supabase/functions/_shared/emails/reminder.ts'
import type { PartyInput, ValidationError } from '../../../supabase/functions/_shared/validation.ts'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isBackendConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly errors: ValidationError[]
  readonly issues: DrawIssue[]
  constructor(
    status: number,
    code: string,
    message: string,
    errors: ValidationError[] = [],
    issues: DrawIssue[] = [],
  ) {
    super(message)
    this.status = status
    this.code = code
    this.errors = errors
    this.issues = issues
  }
}

export interface ManageParty {
  id: string
  name: string
  eventAt: string
  locationName: string
  budgetAmount: number | null
  locale: 'en' | 'ro'
  status: 'draft' | 'drawn'
  drawVersion: number
  sameGender: boolean
  themeIds: string[]
  customThemes: CustomTheme[]
  remindersLastSent: Record<string, string>
}

export interface ManageParticipant {
  id: string
  name: string
  email: string
  gender: 'girl' | 'boy' | null
  isOrganizer: boolean
  invitedAt: string | null
  openedAt: string | null
}

export interface ManageExclusion {
  giverId: string
  gifteeId: string
}

export interface ManageData {
  party: ManageParty
  exclusions: ManageExclusion[]
  participants: ManageParticipant[]
}

export interface RevealData {
  party: {
    name: string
    eventAt: string
    locationName: string
    budgetAmount: number | null
    locale: 'en' | 'ro'
  }
  you: string
  giftee: string
  themeId: string | null
  themeLabel: string | null
  participantNames: string[]
  drawVersion: number
  remade: boolean
}

/** Call a Supabase Edge Function. Access control is enforced inside each function (tokens / access code). */
export async function callFunction<T>(name: string, body?: unknown): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new ApiError(0, 'not_configured', 'Backend is not configured')
  }
  let res: Response
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body ?? {}),
    })
  } catch {
    throw new ApiError(0, 'network', 'Network error')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data.code ?? 'unknown',
      data.message ?? res.statusText,
      data.errors ?? [],
      data.issues ?? [],
    )
  }
  return data as T
}

const manage = (token: string, action: string, extra: Record<string, unknown> = {}) =>
  callFunction<ManageData>('manage-party', { token, action, ...extra })

export const api = {
  health: () => callFunction<{ ok: boolean; time: string }>('health'),
  createParty: (accessCode: string, party: PartyInput) =>
    callFunction<{ adminToken: string; emailSent: boolean }>('create-party', { accessCode, party }),
  getParty: (token: string) => manage(token, 'get'),
  updateParty: (token: string, party: PartyInput) => manage(token, 'update', { party }),
  setThemes: (token: string, themeIds: string[]) => manage(token, 'set-themes', { themeIds }),
  addTheme: (token: string, label: string) => manage(token, 'add-theme', { label }),
  removeTheme: (token: string, themeId: string) => manage(token, 'remove-theme', { themeId }),
  addExclusion: (token: string, giverId: string, gifteeId: string) =>
    manage(token, 'add-exclusion', { giverId, gifteeId }),
  removeExclusion: (token: string, giverId: string, gifteeId: string) =>
    manage(token, 'remove-exclusion', { giverId, gifteeId }),
  startParty: (token: string, sameGender: boolean) => manage(token, 'start', { sameGender }),
  redoDraw: (token: string, sameGender: boolean) => manage(token, 'redo', { sameGender }),
  resendInvite: (token: string, participantId: string) => manage(token, 'resend', { participantId }),
  sendReminder: (token: string, kind: ReminderKind, customMessage?: string) =>
    callFunction<{ sent: number; failed: number; remindersLastSent: Record<string, string> }>('send-reminder', {
      token,
      kind,
      customMessage,
    }),
  reveal: (token: string) => callFunction<RevealData>('reveal', { token }),
}
