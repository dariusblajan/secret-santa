import type { PartyInput, ValidationError } from '../../../supabase/functions/_shared/validation.ts'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isBackendConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly errors: ValidationError[]
  constructor(status: number, code: string, message: string, errors: ValidationError[] = []) {
    super(message)
    this.status = status
    this.code = code
    this.errors = errors
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

export interface ManageData {
  party: ManageParty
  participants: ManageParticipant[]
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
    throw new ApiError(res.status, data.code ?? 'unknown', data.message ?? res.statusText, data.errors ?? [])
  }
  return data as T
}

export const api = {
  health: () => callFunction<{ ok: boolean; time: string }>('health'),
  createParty: (accessCode: string, party: PartyInput) =>
    callFunction<{ adminToken: string; emailSent: boolean }>('create-party', { accessCode, party }),
  getParty: (token: string) => callFunction<ManageData>('manage-party', { token, action: 'get' }),
  updateParty: (token: string, party: PartyInput) =>
    callFunction<ManageData>('manage-party', { token, action: 'update', party }),
}
