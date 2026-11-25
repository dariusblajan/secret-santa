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
    <div className="space-y-3 rounded border border-green-600 bg-green-50 p-4 text-green-950 dark:bg-green-950 dark:text-green-50">
      <p className="font-semibold">🎉 {t('manage.created')}</p>
      <p className="text-sm font-medium">{t('manage.linkTitle')}</p>
      <div className="flex gap-2">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={t('manage.linkTitle')}
          className="w-full rounded border border-green-700 bg-white px-2 py-1 text-sm text-neutral-900"
        />
        <button type="button" onClick={copy} className="shrink-0 rounded bg-green-700 px-3 py-1 text-sm text-white">
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
      <div className="space-y-4">
        <p>{t('manage.notFound')}</p>
        <Link to="/" className="underline">
          {t('common.backHome')}
        </Link>
      </div>
    )
  }
  if (state === 'error' || !data) {
    return (
      <div className="space-y-4">
        <p role="alert">{t('manage.loadError')}</p>
        <button
          type="button"
          onClick={() => {
            setState('loading')
            void load()
          }}
          className="underline"
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
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">{t('common.edit')}</h2>
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
    <section className="space-y-8">
      {navState?.justCreated && <CreatedBanner token={token} emailSent={Boolean(navState.emailSent)} />}

      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-2xl font-semibold">🎄 {party.name}</h2>
          {isDraft && (
            <button type="button" onClick={() => setEditing(true)} className="text-sm underline">
              {t('common.edit')}
            </button>
          )}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-neutral-500">{t('manage.when')}</dt>
          <dd>{formatEventDateTime(party.eventAt, uiLocale)}</dd>
          <dt className="text-neutral-500">{t('manage.location')}</dt>
          <dd>{party.locationName}</dd>
          {party.budgetAmount !== null && (
            <>
              <dt className="text-neutral-500">{t('manage.budget')}</dt>
              <dd>{formatBudget(party.budgetAmount, party.locale)}</dd>
            </>
          )}
          <dt className="text-neutral-500">{t('manage.emailLanguage')}</dt>
          <dd>{t(`language.${party.locale}`)}</dd>
        </dl>
        <p className="inline-block rounded-full bg-neutral-200 px-3 py-1 text-xs font-medium text-neutral-800">
          {isDraft ? t('manage.statusDraft') : t('manage.statusDrawn')}
        </p>
      </div>

      <ParticipantList token={token} data={data} onChange={setData} />

      {isDraft ? (
        <StartPanel token={token} data={data} onChange={setData} />
      ) : (
        <p className="text-xs text-neutral-500">{t('manage.lockedNote')}</p>
      )}
    </section>
  )
}
