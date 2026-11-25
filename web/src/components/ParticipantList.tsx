import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, type ManageData } from '../lib/api'
import { apiErrorMessage } from '../lib/errors'

interface Props {
  token: string
  data: ManageData
  onChange: (data: ManageData) => void
}

export default function ParticipantList({ token, data, onChange }: Props) {
  const { t } = useTranslation()
  const drawn = data.party.status === 'drawn'
  const [resending, setResending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function resend(participantId: string) {
    setResending(participantId)
    setError(null)
    try {
      onChange(await api.resendInvite(token, participantId))
    } catch (err) {
      setError(apiErrorMessage(t, err))
    } finally {
      setResending(null)
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">
        {t('manage.participantsHeading', { count: data.participants.length })}
      </h3>
      {drawn && <p className="text-xs text-neutral-500">{t('manage.startedNote')}</p>}
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <ul className="divide-y divide-neutral-200 rounded border border-neutral-200">
        {data.participants.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm">
            <div>
              <p className="font-medium">
                {p.name}
                {p.isOrganizer && (
                  <span className="ml-2 text-xs font-normal text-neutral-500">
                    ({t('manage.you')}, {t('manage.organizer')})
                  </span>
                )}
              </p>
              <p className="text-neutral-500">
                {p.email}
                {p.gender && ` · ${t(`participants.${p.gender}`)}`}
              </p>
            </div>
            {drawn && (
              <div className="flex flex-col items-end gap-1 text-xs">
                {p.invitedAt ? (
                  <span className="text-green-700">✓ {t('manage.inviteSent')}</span>
                ) : (
                  <>
                    <span className="text-amber-700">⚠ {t('manage.inviteFailed')}</span>
                    <button
                      type="button"
                      disabled={resending === p.id}
                      onClick={() => void resend(p.id)}
                      className="underline disabled:opacity-60"
                    >
                      {resending === p.id ? t('manage.resending') : t('manage.resend')}
                    </button>
                  </>
                )}
                <span className="text-neutral-500">{p.openedAt ? t('manage.opened') : t('manage.notOpened')}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
