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
    <details open={exclusions.length > 0} className="space-y-3">
      <summary className="cursor-pointer text-lg font-semibold">
        {t('exclusions.title')}
        {exclusions.length > 0 && ` (${exclusions.length})`}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-neutral-500">{t('exclusions.hint')}</p>
        <p className="text-xs text-neutral-500">{t('exclusions.privacy')}</p>
        {exclusions.length > 0 && (
          <ul className="divide-y divide-neutral-200 rounded border border-neutral-200">
            {exclusions.map((x) => (
              <li key={`${x.giverId}-${x.gifteeId}`} className="flex items-center justify-between gap-3 p-2 text-sm">
                <span>{t('exclusions.rule', { giver: name(x.giverId), giftee: name(x.gifteeId) })}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(() => api.removeExclusion(token, x.giverId, x.gifteeId))}
                  aria-label={t('exclusions.remove', { giver: name(x.giverId), giftee: name(x.gifteeId) })}
                  className="text-neutral-600 hover:text-red-700"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={add} className="flex flex-wrap items-center gap-2 text-sm">
          <select
            value={giver}
            onChange={(e) => setGiver(e.target.value)}
            aria-label={t('exclusions.giver')}
            className="rounded border border-neutral-300 px-2 py-1"
          >
            <option value="">{t('exclusions.giver')}</option>
            {participants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span>{t('exclusions.cantBuyFor')}</span>
          <select
            value={giftee}
            onChange={(e) => setGiftee(e.target.value)}
            aria-label={t('exclusions.giftee')}
            className="rounded border border-neutral-300 px-2 py-1"
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
            className="rounded border border-neutral-300 px-3 py-1 disabled:opacity-50"
          >
            {t('exclusions.add')}
          </button>
        </form>
        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  )
}
