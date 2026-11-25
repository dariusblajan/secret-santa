import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { themeLabel } from '../../../supabase/functions/_shared/themes.ts'
import { formatBudget, formatEventDateTime } from '../../../supabase/functions/_shared/time.ts'
import { api, ApiError, type RevealData } from '../lib/api'

type LoadState = 'loading' | 'ready' | 'notFound' | 'error'

// Minimal version: Iteration 3 adds the tap-to-reveal interaction and the "draw was remade" banner.
export default function RevealPage() {
  const { t, i18n } = useTranslation()
  const { token = '' } = useParams()
  const [state, setState] = useState<LoadState>('loading')
  const [data, setData] = useState<RevealData | null>(null)
  const uiLocale = i18n.language === 'ro' ? 'ro' : 'en'

  useEffect(() => {
    let cancelled = false
    api
      .reveal(token)
      .then((d) => {
        if (cancelled) return
        setData(d)
        setState('ready')
      })
      .catch((err) => {
        if (!cancelled) setState(err instanceof ApiError && err.code === 'not_found' ? 'notFound' : 'error')
      })
    return () => {
      cancelled = true
    }
  }, [token])

  if (state === 'loading') return <p>{t('common.loading')}</p>
  if (state === 'notFound') return <p>{t('reveal.notFound')}</p>
  if (state === 'error' || !data) return <p role="alert">{t('reveal.loadError')}</p>

  const { party } = data
  return (
    <section className="space-y-8">
      <h2 className="text-2xl font-semibold">{t('reveal.greeting', { name: data.you })}</h2>

      <div className="space-y-4 rounded border border-red-700 bg-red-50 p-6 text-center text-red-950 dark:bg-red-950 dark:text-red-50">
        <p className="text-sm">{t('reveal.buyingFor')}</p>
        <p className="text-3xl font-bold">🎁 {data.giftee}</p>
        {data.themeId && (
          <p className="text-sm">
            {t('reveal.theme')}: <strong>{themeLabel(data.themeId, uiLocale)}</strong>
          </p>
        )}
        <p className="text-xs opacity-80">{t('reveal.secret')}</p>
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-semibold">🎄 {party.name}</h3>
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
          <dt className="text-neutral-500">{t('reveal.whosComing')}</dt>
          <dd>{data.participantNames.join(', ')}</dd>
        </dl>
      </div>
    </section>
  )
}
