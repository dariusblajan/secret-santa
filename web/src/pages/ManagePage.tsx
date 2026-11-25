import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useParams } from 'react-router-dom'
import { formatBudget, formatEventDateTime } from '../../../supabase/functions/_shared/time.ts'
import type { ValidationError } from '../../../supabase/functions/_shared/validation.ts'
import ParticipantList from '../components/ParticipantList'
import PartyForm from '../components/PartyForm'
import StartPanel from '../components/StartPanel'
import { api, ApiError, type ManageData } from '../lib/api'
import { apiErrorMessage } from '../lib/errors'
import { formFromManageData, toPartyInput } from '../lib/partyForm'

type LoadState = 'loading' | 'ready' | 'notFound' | 'error'

function adminLink(token: string): string {
  return `${window.location.origin}${window.location.pathname}#/manage/${token}`
}

function CreatedBanner({ token, emailSent }: { token: string; emailSent: boolean }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const link = adminLink(token)

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard may be blocked; the link is selectable in the field.
    }
  }

  return (
    <div className="callout callout-ok grid gap-3 p-4">
      <p className="font-display text-lg font-bold">🎉 {t('manage.created')}</p>
      <p className="text-sm font-bold">{t('manage.linkTitle')}</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={t('manage.linkTitle')}
          className="input min-w-0 text-sm"
        />
        <button type="button" onClick={copy} className="btn btn-secondary">
          {copied ? t('common.copied') : t('common.copy')}
        </button>
      </div>
      <p className="text-sm">
        {t('manage.linkHelp')} {emailSent ? t('manage.emailSent') : t('manage.emailNotSent')}
      </p>
    </div>
  )
}

export default function ManagePage() {
  const { t, i18n } = useTranslation()
  const { token = '' } = useParams()
  const navState = useLocation().state as { justCreated?: boolean; emailSent?: boolean } | null

  const [state, setState] = useState<LoadState>('loading')
  const [data, setData] = useState<ManageData | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [serverErrors, setServerErrors] = useState<ValidationError[]>([])
  const [now] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      setData(await api.getParty(token))
      setState('ready')
    } catch (err) {
      setState(err instanceof ApiError && err.code === 'not_found' ? 'notFound' : 'error')
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  if (state === 'loading') return <p>{t('common.loading')}</p>
  if (state === 'notFound') {
    return (
      <div className="grid gap-4">
        <p>{t('manage.notFound')}</p>
        <Link to="/" className="btn btn-neutral sm:w-fit">
          {t('common.backHome')}
        </Link>
      </div>
    )
  }
  if (state === 'error' || !data) {
    return (
      <div className="grid gap-4">
        <p className="callout callout-error" role="alert">{t('manage.loadError')}</p>
        <button
          type="button"
          onClick={() => {
            setState('loading')
            void load()
          }}
          className="btn btn-secondary sm:w-fit"
        >
          {t('common.tryAgain')}
        </button>
      </div>
    )
  }

  const { party } = data
  const isDraft = party.status === 'draft'
  const uiLocale = i18n.language === 'ro' ? 'ro' : 'en'

  if (editing) {
    return (
      <section className="grid gap-6">
        <h2 className="page-title">{t('common.edit')}</h2>
        <PartyForm
          mode="edit"
          initial={formFromManageData(data)}
          submitting={saving}
          serverErrors={serverErrors}
          formError={formError}
          onCancel={() => {
            setEditing(false)
            setFormError(null)
            setServerErrors([])
          }}
          onSubmit={async (values) => {
            setSaving(true)
            setFormError(null)
            setServerErrors([])
            try {
              setData(await api.updateParty(token, toPartyInput(values)))
              setEditing(false)
            } catch (err) {
              if (err instanceof ApiError) setServerErrors(err.errors)
              setFormError(apiErrorMessage(t, err))
            } finally {
              setSaving(false)
            }
          }}
        />
      </section>
    )
  }

  return (
    <section className="grid gap-6">
      {navState?.justCreated && <CreatedBanner token={token} emailSent={Boolean(navState.emailSent)} />}

      <div className="card">
        <div className="grid gap-2">
          <p className="pill w-fit">{isDraft ? t('manage.statusDraft') : t('manage.statusDrawn')}</p>
          <h2 className="page-title break-words">🎄 {party.name}</h2>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[15px]">
          <dt className="font-bold text-muted">{t('manage.when')}</dt>
          <dd>{formatEventDateTime(party.eventAt, uiLocale)}</dd>
          <dt className="font-bold text-muted">{t('manage.location')}</dt>
          <dd>{party.locationName}</dd>
          {party.budgetAmount !== null && (
            <>
              <dt className="font-bold text-muted">{t('manage.budget')}</dt>
              <dd>{formatBudget(party.budgetAmount, party.locale)}</dd>
            </>
          )}
          <dt className="font-bold text-muted">{t('manage.emailLanguage')}</dt>
          <dd>{t(`language.${party.locale}`)}</dd>
        </dl>
        {isDraft && (
          <button type="button" onClick={() => setEditing(true)} className="btn btn-neutral">
            {t('common.edit')}
          </button>
        )}
      </div>

      <ParticipantList token={token} data={data} onChange={setData} />

      {isDraft ? (
        <StartPanel token={token} data={data} onChange={setData} />
      ) : (
        <>
          <p className="note">{t('manage.lockedNote')}</p>
          {new Date(party.eventAt).getTime() > now ? (
            <StartPanel token={token} data={data} onChange={setData} />
          ) : (
            <p className="note">{t('redo.eventPassed')}</p>
          )}
        </>
      )}
    </section>
  )
}
