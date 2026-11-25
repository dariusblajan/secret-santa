import { useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { todayInBucharest } from '../../../supabase/functions/_shared/time.ts'
import {
  LIMITS,
  validateParty,
  type Locale,
  type ValidationError,
} from '../../../supabase/functions/_shared/validation.ts'
import ImportDialog from './ImportDialog'
import type { ImportRow } from '../lib/participantsImport'
import { errorMessage } from '../lib/errors'
import { toPartyInput, type PartyFormValues } from '../lib/partyForm'

interface Props {
  mode: 'create' | 'edit'
  initial: PartyFormValues
  submitting: boolean
  /** Field errors returned by the server (merged with client-side ones). */
  serverErrors?: ValidationError[]
  /** Non-field error to show above the submit button. */
  formError?: string | null
  onSubmit: (values: PartyFormValues, accessCode: string) => void
  onCancel?: () => void
}

const inputClass =
  'w-full rounded border border-neutral-300 bg-transparent px-3 py-2 text-base aria-[invalid=true]:border-red-600'

function Field(props: { label: string; hint?: string; error?: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={props.htmlFor} className="block text-sm font-medium">
        {props.label}
      </label>
      {props.children}
      {props.hint && !props.error && <p className="text-xs text-neutral-500">{props.hint}</p>}
      {props.error && (
        <p className="text-xs text-red-600" role="alert">
          {props.error}
        </p>
      )}
    </div>
  )
}

export default function PartyForm({ mode, initial, submitting, serverErrors, formError, onSubmit, onCancel }: Props) {
  const { t } = useTranslation()
  const [values, setValues] = useState<PartyFormValues>(initial)
  const [accessCode, setAccessCode] = useState('')
  const [clientErrors, setClientErrors] = useState<ValidationError[]>([])
  const [accessCodeMissing, setAccessCodeMissing] = useState(false)
  const [importing, setImporting] = useState(false)

  // Server errors come from props, so "cleared" ones are remembered here and reset when a new response arrives.
  const [dismissed, setDismissed] = useState<{ source: ValidationError[] | undefined; fields: string[] }>({
    source: serverErrors,
    fields: [],
  })
  const dismissedFields = dismissed.source === serverErrors ? dismissed.fields : []

  const errors = [
    ...clientErrors,
    ...(serverErrors ?? []).filter((e) => !dismissedFields.includes(e.field)),
  ]
  const errorFor = (field: string): string | undefined => {
    const found = errors.find((e) => e.field === field)
    return found ? errorMessage(t, found.code) : undefined
  }

  /**
   * After the values changed, refresh the errors of the affected fields: a field that was showing an error
   * is re-checked against the new values (so it disappears once valid and stays if still invalid),
   * and a field that wasn't showing one is left alone until submit.
   */
  function refreshErrors(
    next: PartyFormValues,
    affected: (field: string) => boolean,
    remap: (field: string) => string = (f) => f,
  ) {
    const shown = new Set(errors.filter((e) => affected(e.field)).map((e) => remap(e.field)))
    if (shown.size === 0) return
    const fresh = validateParty(toPartyInput(next)).filter((e) => shown.has(e.field))
    setClientErrors((prev) => [...prev.filter((e) => !affected(e.field)), ...fresh])
    setDismissed({ source: serverErrors, fields: [...new Set([...dismissedFields, ...shown])] })
  }

  const FIELD_ERROR_KEY: Partial<Record<keyof PartyFormValues, string>> = { budget: 'budgetAmount' }

  const set = <K extends keyof PartyFormValues>(key: K, value: PartyFormValues[K]) => {
    const next = { ...values, [key]: value }
    setValues(next)
    const field = FIELD_ERROR_KEY[key] ?? key
    refreshErrors(next, (f) => f === field)
  }

  const setParticipant = (index: number, patch: Partial<PartyFormValues['participants'][number]>) => {
    const next = {
      ...values,
      participants: values.participants.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    }
    setValues(next)
    // An email change can also resolve (or cause) a duplicate-email error on another row.
    const emailChanged = 'email' in patch
    refreshErrors(next, (f) =>
      emailChanged ? /^participants\.\d+\.email$/.test(f) : (['name', 'email'] as const).some((k) => k in patch && f === `participants.${index}.${k}`),
    )
  }

  const addParticipant = () =>
    setValues((v) => ({ ...v, participants: [...v.participants, { name: '', email: '', gender: '' }] }))

  const removeParticipant = (index: number) => {
    const next = { ...values, participants: values.participants.filter((_, i) => i !== index) }
    setValues(next)
    // Row numbers shift, so re-check every participant field that was showing an error.
    refreshErrors(next, (f) => f.startsWith('participants.'))
  }

  // The organizer is always the first entry, so "make organizer" swaps that person with the current first one.
  const isBlank = (p: PartyFormValues['participants'][number]) => p.name.trim() === '' && p.email.trim() === ''

  const makeOrganizer = (index: number) => {
    const people = values.participants
    // A blank organizer slot (e.g. after importing before filling in your own details) is dropped, not swapped
    // down into the list. Otherwise the two entries trade places.
    const dropFirst = isBlank(people[0])
    const reordered = dropFirst
      ? [people[index], ...people.filter((_, i) => i !== 0 && i !== index)]
      : people.map((p, i) => (i === 0 ? people[index] : i === index ? people[0] : p))
    const next = { ...values, participants: reordered }
    setValues(next)

    // Error markers follow their rows to the new positions; the dropped row's markers disappear with it.
    const newIndex = (k: number) =>
      dropFirst ? (k === 0 ? -1 : k === index ? 0 : k < index ? k : k - 1) : k === 0 ? index : k === index ? 0 : k
    const follow = (f: string) =>
      f.replace(/^participants\.(\d+)\./, (_m, n) => `participants.${newIndex(Number(n))}.`)
    refreshErrors(next, (f) => f.startsWith('participants.'), follow)
  }

  // Imported rows are appended after the existing entries (the organizer stays first). Nothing is saved yet;
  // participant-level errors are shown right away so problem rows can be fixed in place.
  function addImported(rows: ImportRow[]) {
    const kept = values.participants.filter((p, i) => i === 0 || p.name.trim() !== '' || p.email.trim() !== '')
    const next = {
      ...values,
      participants: [...kept, ...rows.map((r) => ({ name: r.name, email: r.email, gender: r.gender }))],
    }
    setValues(next)
    setClientErrors(validateParty(toPartyInput(next)).filter((e) => e.field.startsWith('participants.')))
    setDismissed({
      source: serverErrors,
      fields: [...new Set([...dismissedFields, ...(serverErrors ?? []).map((e) => e.field)])],
    })
    setImporting(false)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const found = validateParty(toPartyInput(values))
    const missingCode = mode === 'create' && accessCode.trim() === ''
    setClientErrors(found)
    setAccessCodeMissing(missingCode)
    if (found.length > 0 || missingCode) return
    onSubmit(values, accessCode)
  }

  const currency = t(values.locale === 'ro' ? 'party.currencyRo' : 'party.currencyEn')
  const participantsError = errorFor('participants')

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8">
      {mode === 'create' && (
        <Field
          label={t('create.accessCode')}
          hint={t('create.accessCodeHint')}
          error={accessCodeMissing ? errorMessage(t, 'required') : undefined}
          htmlFor="accessCode"
        >
          <input
            id="accessCode"
            type="password"
            autoComplete="off"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            aria-invalid={accessCodeMissing}
            className={inputClass}
          />
        </Field>
      )}

      <section className="space-y-4">
        <h3 className="text-lg font-semibold">{t('party.details')}</h3>

        <Field label={t('party.name')} error={errorFor('name')} htmlFor="name">
          <input
            id="name"
            value={values.name}
            maxLength={LIMITS.nameMax + 20}
            onChange={(e) => set('name', e.target.value)}
            aria-invalid={Boolean(errorFor('name'))}
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label={t('party.date')} error={errorFor('date')} htmlFor="date">
            <input
              id="date"
              type="date"
              min={todayInBucharest()}
              value={values.date}
              onChange={(e) => set('date', e.target.value)}
              aria-invalid={Boolean(errorFor('date'))}
              className={inputClass}
            />
          </Field>
          <Field label={t('party.time')} hint={t('party.timeHint')} error={errorFor('time')} htmlFor="time">
            <input
              id="time"
              type="time"
              value={values.time}
              onChange={(e) => set('time', e.target.value)}
              aria-invalid={Boolean(errorFor('time'))}
              className={inputClass}
            />
          </Field>
        </div>

        <Field
          label={t('party.location')}
          hint={t('party.locationHint')}
          error={errorFor('locationName')}
          htmlFor="locationName"
        >
          <input
            id="locationName"
            value={values.locationName}
            onChange={(e) => set('locationName', e.target.value)}
            aria-invalid={Boolean(errorFor('locationName'))}
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label={t('party.budget')} error={errorFor('budgetAmount')} htmlFor="budget">
            <div className="flex items-center gap-2">
              <input
                id="budget"
                inputMode="decimal"
                value={values.budget}
                placeholder={t('party.budgetPlaceholder', { lng: values.locale })}
                onChange={(e) => set('budget', e.target.value)}
                aria-invalid={Boolean(errorFor('budgetAmount'))}
                className={inputClass}
              />
              <span className="text-sm text-neutral-500">{currency}</span>
            </div>
          </Field>
          <Field
            label={t('party.language')}
            hint={t('party.languageHint')}
            error={errorFor('locale')}
            htmlFor="locale"
          >
            <select
              id="locale"
              value={values.locale}
              onChange={(e) => set('locale', e.target.value as Locale)}
              className={inputClass}
            >
              <option value="en">{t('language.en')}</option>
              <option value="ro">{t('language.ro')}</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-lg font-semibold">{t('participants.title')}</h3>
          <span className="text-sm text-neutral-500">
            {t('participants.counter', { count: values.participants.length, max: LIMITS.maxParticipants })}
          </span>
        </div>
        <p className="text-xs text-neutral-500">
          {t('participants.minHint', { min: LIMITS.minParticipantsToStart })}
        </p>
        {participantsError && (
          <p className="text-xs text-red-600" role="alert">
            {participantsError}
          </p>
        )}

        <ul className="space-y-4">
          {values.participants.map((p, i) => {
            const nameError = errorFor(`participants.${i}.name`)
            const emailError = errorFor(`participants.${i}.email`)
            return (
              <li key={i} className="space-y-3 rounded border border-neutral-200 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {i === 0 ? t('participants.you') : `#${i + 1}`}
                  </span>
                  {i > 0 && (
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => makeOrganizer(i)}
                        className="text-sm underline"
                        aria-label={`${t('participants.makeOrganizer')} #${i + 1}`}
                      >
                        {t('participants.makeOrganizer')}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeParticipant(i)}
                        className="text-sm text-red-700 underline"
                        aria-label={`${t('participants.remove')} #${i + 1}`}
                      >
                        {t('participants.remove')}
                      </button>
                    </div>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t('participants.name')} error={nameError} htmlFor={`p-${i}-name`}>
                    <input
                      id={`p-${i}-name`}
                      value={p.name}
                      onChange={(e) => setParticipant(i, { name: e.target.value })}
                      aria-invalid={Boolean(nameError)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label={t('participants.email')} error={emailError} htmlFor={`p-${i}-email`}>
                    <input
                      id={`p-${i}-email`}
                      type="email"
                      value={p.email}
                      onChange={(e) => setParticipant(i, { email: e.target.value })}
                      aria-invalid={Boolean(emailError)}
                      className={inputClass}
                    />
                  </Field>
                </div>
                <Field label={t('participants.gender')} htmlFor={`p-${i}-gender`}>
                  <select
                    id={`p-${i}-gender`}
                    value={p.gender}
                    onChange={(e) => setParticipant(i, { gender: e.target.value as '' | 'girl' | 'boy' })}
                    className={inputClass}
                  >
                    <option value="">{t('participants.genderNone')}</option>
                    <option value="girl">{t('participants.girl')}</option>
                    <option value="boy">{t('participants.boy')}</option>
                  </select>
                </Field>
              </li>
            )
          })}
        </ul>

        <button
          type="button"
          onClick={addParticipant}
          disabled={values.participants.length >= LIMITS.maxParticipants}
          className="rounded border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
        >
          + {t('participants.add')}
        </button>
        <button
          type="button"
          onClick={() => setImporting(true)}
          disabled={values.participants.length >= LIMITS.maxParticipants}
          className="ml-2 rounded border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
        >
          {t('import.button')}
        </button>
        {importing && (
          <ImportDialog
            existingEmails={values.participants.map((p) => p.email)}
            currentCount={values.participants.filter((p, i) => i === 0 || p.name.trim() !== '' || p.email.trim() !== '').length}
            onAdd={addImported}
            onClose={() => setImporting(false)}
          />
        )}
      </section>

      {formError && (
        <p className="text-sm text-red-600" role="alert">
          {formError}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-red-700 px-5 py-2 font-medium text-white disabled:opacity-60"
        >
          {submitting ? t('common.saving') : mode === 'create' ? t('create.submit') : t('common.save')}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded border border-neutral-300 px-5 py-2">
            {t('common.cancel')}
          </button>
        )}
      </div>
    </form>
  )
}
