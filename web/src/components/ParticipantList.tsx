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
    <div className="card">
      <h3 className="card-title">
        {t('manage.participantsHeading', { count: data.participants.length })}
      </h3>
      {drawn && <p className="note">{t('manage.startedNote')}</p>}
      {error && (
        <p className="callout callout-error" role="alert">
          {error}
        </p>
      )}
      <ul className="grid gap-3">
        {data.participants.map((p) => (
          <li key={p.id} className="grid gap-2 rounded-[14px] bg-paper-deep p-3.5 text-sm">
            <div className="min-w-0">
              <p className="font-bold">
                {p.name}
                {p.isOrganizer && (
                  <span className="ml-2 text-xs font-extrabold text-pine">
                    ({t('manage.you')}, {t('manage.organizer')})
                  </span>
                )}
              </p>
              <p className="break-all text-muted">
                {p.email}
                {p.gender && ` · ${t(`participants.${p.gender}`)}`}
              </p>
            </div>
            {drawn && (
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                {p.invitedAt ? (
                  <span className="font-bold text-pine">✓ {t('manage.inviteSent')}</span>
                ) : (
                  <>
                    <span className="font-bold text-warn">⚠ {t('manage.inviteFailed')}</span>
                    <button
                      type="button"
                      disabled={resending === p.id}
                      onClick={() => void resend(p.id)}
                      className="btn btn-secondary btn-sm"
                    >
                      {resending === p.id ? t('manage.resending') : t('manage.resend')}
                    </button>
                  </>
                )}
                <span className="text-muted">{p.openedAt ? t('manage.opened') : t('manage.notOpened')}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
