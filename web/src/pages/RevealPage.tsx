import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { themeLabel } from '../../../supabase/functions/_shared/themes.ts'
import { formatBudget, formatEventDateTime } from '../../../supabase/functions/_shared/time.ts'
import { api, ApiError, type RevealData } from '../lib/api'

type LoadState = 'loading' | 'ready' | 'notFound' | 'error'

// The match stays hidden until tapped. Once revealed it is remembered on this device for this draw version,
// so a redo (new version) hides it again.
function storageKey(token: string, drawVersion: number) {
  return `ss-revealed:${token.slice(0, 16)}:${drawVersion}`
}

function wasRevealed(token: string, drawVersion: number): boolean {
  try {
    return localStorage.getItem(storageKey(token, drawVersion)) === '1'
  } catch {
    return false
  }
}

function rememberRevealed(token: string, drawVersion: number) {
  try {
    localStorage.setItem(storageKey(token, drawVersion), '1')
  } catch {
    // Storage may be blocked; the match is simply hidden again on the next visit.
  }
}

export default function RevealPage() {
  const { t, i18n } = useTranslation()
  const { token = '' } = useParams()
  const [state, setState] = useState<LoadState>('loading')
  const [data, setData] = useState<RevealData | null>(null)
  const [shown, setShown] = useState(false)
  const uiLocale = i18n.language === 'ro' ? 'ro' : 'en'

  useEffect(() => {
    let cancelled = false
    api
      .reveal(token)
      .then((d) => {
        if (cancelled) return
        setData(d)
        setShown(wasRevealed(token, d.drawVersion))
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

      {data.remade && (
        <div
          role="status"
          className="rounded border border-amber-500 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-50"
        >
          ⚠️ <strong>{t('reveal.remadeTitle')}</strong> {t('reveal.remadeBody')}
        </div>
      )}

      {shown ? (
        <div className="reveal-pop space-y-4 rounded border border-red-700 bg-red-50 p-6 text-center text-red-950 dark:bg-red-950 dark:text-red-50">
          <p className="text-sm">{t('reveal.buyingFor')}</p>
          <p className="text-3xl font-bold break-words">🎁 {data.giftee}</p>
          {data.themeId && (
            <p className="text-sm">
              {t('reveal.theme')}: <strong>{themeLabel(data.themeId, uiLocale)}</strong>
            </p>
          )}
          <p className="text-xs opacity-80">{t('reveal.secret')}</p>
          <button
            type="button"
            onClick={() => setShown(false)}
            className="text-xs underline opacity-80"
          >
            {t('reveal.hide')}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            rememberRevealed(token, data.drawVersion)
            setShown(true)
          }}
          className="flex min-h-48 w-full flex-col items-center justify-center gap-3 rounded border-2 border-dashed border-red-700 bg-red-50 p-6 text-red-950 active:scale-[0.98] dark:bg-red-950 dark:text-red-50"
        >
          <span className="text-6xl" aria-hidden="true">
            🎁
          </span>
          <span className="text-lg font-semibold">{t('reveal.tapToReveal')}</span>
          <span className="text-xs opacity-80">{t('reveal.tapHint')}</span>
        </button>
      )}

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
