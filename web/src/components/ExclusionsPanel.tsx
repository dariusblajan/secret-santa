import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type ManageData } from '../lib/api'
import { apiErrorMessage } from '../lib/errors'

interface Props {
  token: string
  data: ManageData
  onChange: (data: ManageData) => void
}

export default function ExclusionsPanel({ token, data, onChange }: Props) {
  const { t } = useTranslation()
  const { participants, exclusions } = data
  const [giver, setGiver] = useState('')
  const [giftee, setGiftee] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = (id: string) => participants.find((p) => p.id === id)?.name ?? '?'

  async function run(action: () => Promise<ManageData>, after?: () => void) {
    setBusy(true)
    setError(null)
    try {
      onChange(await action())
      after?.()
    } catch (err) {
      setError(apiErrorMessage(t, err))
    } finally {
      setBusy(false)
    }
  }

  function add(e: FormEvent) {
    e.preventDefault()
    if (giver && giftee) {
      void run(() => api.addExclusion(token, giver, giftee), () => {
        setGiver('')
        setGiftee('')
      })
    }
  }

  return (
    <details open={exclusions.length > 0} className="card">
      <summary className="card-title flex min-h-11 cursor-pointer items-center">
        {t('exclusions.title')}
        {exclusions.length > 0 && ` (${exclusions.length})`}
      </summary>
      <div className="mt-3 grid gap-3">
        <p className="note">{t('exclusions.hint')}</p>
        <p className="note">{t('exclusions.privacy')}</p>
        {exclusions.length > 0 && (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {exclusions.map((x) => (
              <li key={`${x.giverId}-${x.gifteeId}`} className="flex items-center justify-between gap-3 py-2 pr-2 pl-3 text-sm">
                <span>{t('exclusions.rule', { giver: name(x.giverId), giftee: name(x.gifteeId) })}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => api.removeExclusion(token, x.giverId, x.gifteeId))}
                  aria-label={t('exclusions.remove', { giver: name(x.giverId), giftee: name(x.gifteeId) })}
                  className="btn btn-danger btn-sm !min-h-11 w-11 shrink-0 !px-0"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={add} className="grid gap-2 text-sm">
          <select
            value={giver}
            onChange={(e) => setGiver(e.target.value)}
            aria-label={t('exclusions.giver')}
            className="input"
          >
            <option value="">{t('exclusions.giver')}</option>
            {participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="text-center font-bold text-muted">{t('exclusions.cantBuyFor')}</span>
          <select
            value={giftee}
            onChange={(e) => setGiftee(e.target.value)}
            aria-label={t('exclusions.giftee')}
            className="input"
          >
            <option value="">{t('exclusions.giftee')}</option>
            {participants
              .filter((p) => p.id !== giver)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <button
            type="submit"
            disabled={busy || !giver || !giftee}
            className="btn btn-secondary"
          >
            {t('exclusions.add')}
          </button>
        </form>
        {error && (
          <p className="callout callout-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  )
}
