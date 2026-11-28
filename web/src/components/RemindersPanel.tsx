import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CUSTOM_MESSAGE_MAX,
  REMINDER_KINDS,
  reminderEmail,
  type ReminderKind,
} from '../../../supabase/functions/_shared/emails/reminder.ts'
import { daysUntilEvent } from '../../../supabase/functions/_shared/time.ts'
import { api, type ManageData } from '../lib/api'
import { apiErrorMessage } from '../lib/errors'

interface Props {
  token: string
  data: ManageData
  onChange: (data: ManageData) => void
}

export default function RemindersPanel({ token, data, onChange }: Props) {
  const { t, i18n } = useTranslation()
  const { party, participants } = data
  const [kind, setKind] = useState<ReminderKind>('countdown')
  const [message, setMessage] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (confirming) cancelRef.current?.focus()
  }, [confirming])

  const customEmpty = kind === 'custom' && !message.trim()

  function lastSent(k: ReminderKind): string {
    const iso = party.remindersLastSent[k]
    if (!iso) return t('reminders.neverSent')
    const time = new Intl.DateTimeFormat(i18n.language === 'ro' ? 'ro-RO' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
    return t('reminders.lastSent', { time })
  }

  // Sample data only: the organizer must never see a real match.
  const preview = reminderEmail({
    kind,
    locale: party.locale,
    recipientName: t('reminders.sampleName', { lng: party.locale }),
    partyName: party.name,
    eventAt: party.eventAt,
    locationName: party.locationName,
    budgetAmount: party.budgetAmount,
    daysLeft: daysUntilEvent(party.eventAt),
    gifteeName: t('reminders.sampleGiftee', { lng: party.locale }),
    themeLabel: t('reminders.sampleTheme', { lng: party.locale }),
    customMessage: message.trim(),
  })

  async function send() {
    setSending(true)
    setError(null)
    setResult(null)
    try {
      const res = await api.sendReminder(token, kind, kind === 'custom' ? message : undefined)
      onChange({ ...data, party: { ...party, remindersLastSent: res.remindersLastSent } })
      setResult(
        res.sent === 0
          ? t('reminders.allFailed')
          : res.failed > 0
            ? t('reminders.partial', { sent: res.sent, failed: res.failed })
            : t('reminders.done', { count: res.sent }),
      )
      setConfirming(false)
    } catch (err) {
      setError(apiErrorMessage(t, err))
      setConfirming(false)
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="card">
      <h3 className="card-title">{t('reminders.title')}</h3>
      <p className="note">{t('reminders.intro')}</p>

      <fieldset className="grid gap-2">
        <legend className="sr-only">{t('reminders.title')}</legend>
        {REMINDER_KINDS.map((k) => (
          <label key={k} className="flex min-h-11 items-start gap-3 py-1">
            <input
              className="mt-1 h-5 w-5 accent-berry"
              type="radio"
              name="reminder-kind"
              checked={kind === k}
              onChange={() => {
                setKind(k)
                setResult(null)
                setError(null)
              }}
            />
            <span className="grid">
              <span className="font-bold">{t(`reminders.${k}`)}</span>
              <span className="note">{t(`reminders.${k}Hint`)}</span>
              <span className="text-sm text-muted">{lastSent(k)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {kind === 'custom' && (
        <div className="grid gap-1">
          <label className="text-sm font-bold" htmlFor="reminder-message">
            {t('reminders.messageLabel')}
          </label>
          <textarea
            id="reminder-message"
            className="input min-h-28"
            value={message}
            maxLength={CUSTOM_MESSAGE_MAX}
            placeholder={t('reminders.messagePlaceholder')}
            onChange={(e) => setMessage(e.target.value)}
          />
          <p className="note">{t('reminders.messageCount', { count: message.length, max: CUSTOM_MESSAGE_MAX })}</p>
        </div>
      )}

      <button
        type="button"
        className="btn btn-neutral sm:w-fit"
        aria-expanded={showPreview}
        onClick={() => setShowPreview((v) => !v)}
      >
        {showPreview ? t('reminders.hidePreview') : t('reminders.preview')}
      </button>
      {showPreview && (
        <div className="grid gap-2">
          <p className="note">{t('reminders.previewNote')}</p>
          <p className="font-bold">{preview.subject}</p>
          <pre className="whitespace-pre-wrap rounded-lg border-[1.5px] border-line bg-surface p-3 text-sm">
            {preview.text}
          </pre>
        </div>
      )}

      {result && (
        <p className="callout callout-ok font-bold" role="status">
          ✓ {result}
        </p>
      )}
      {error && (
        <p className="callout callout-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={customEmpty || sending}
        onClick={() => setConfirming(true)}
        className="btn btn-primary btn-block sm:w-auto sm:min-w-56 sm:justify-self-end"
      >
        {sending ? t('reminders.sending') : t('reminders.send')}
      </button>

      {confirming && (
        <div className="modal-backdrop" onKeyDown={(e) => e.key === 'Escape' && !sending && setConfirming(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="reminder-title" className="modal grid max-w-md gap-4">
            <h3 id="reminder-title" className="card-title">
              {t('reminders.dialogTitle')}
            </h3>
            <p className="text-[15px]">
              <strong>{t(`reminders.${kind}`)}</strong>. {t('reminders.dialogBody', { count: participants.length })}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:flex sm:justify-end">
              <button
                ref={cancelRef}
                type="button"
                disabled={sending}
                onClick={() => setConfirming(false)}
                className="btn btn-neutral"
              >
                {t('start.dialogCancel')}
              </button>
              <button type="button" disabled={sending} onClick={() => void send()} className="btn btn-primary">
                {sending ? t('reminders.sending') : t('reminders.dialogConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
