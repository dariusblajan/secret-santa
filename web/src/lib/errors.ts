import type { TFunction } from 'i18next'
import { LIMITS } from '../../../supabase/functions/_shared/validation.ts'
import { ApiError } from './api'

/** Translate an error code (validation or API) into a user-facing message. */
export function errorMessage(t: TFunction, code: string): string {
  const key = `errors.${code}`
  return t(key, { defaultValue: t('errors.unknown'), max: LIMITS.maxParticipants })
}

export function apiErrorMessage(t: TFunction, err: unknown): string {
  return errorMessage(t, err instanceof ApiError ? err.code : 'unknown')
}
