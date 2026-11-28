import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { themeLabel } from '../../../supabase/functions/_shared/themes.ts'
import { formatBudget, formatEventDateTime } from '../../../supabase/functions/_shared/time.ts'
import { api, ApiError, type RevealData } from '../lib/api'
import Loading from '../components/Loading'

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

  if (state === 'loading') return <Loading />
  if (state === 'notFound') return <p className="callout callout-warn">{t('reveal.notFound')}</p>
  if (state === 'error' || !data) return <p className="callout callout-error" role="alert">{t('reveal.loadError')}</p>

  const { party } = data
  return (
    <section className="grid gap-6">
      <h2 className="page-title">{t('reveal.greeting', { name: data.you })}</h2>

      {data.remade && (
        <div
          role="status"
          className="callout callout-warn"
        >
          ⚠️ <strong>{t('reveal.remadeTitle')}</strong> {t('reveal.remadeBody')}
        </div>
      )}

      {shown ? (
        <div className="reveal-pop grid gap-4 rounded-2xl border-2 border-berry bg-surface p-6 text-center shadow-[0_4px_0_var(--color-berry)]">
          <p className="text-sm">{t('reveal.buyingFor')}</p>
          <p className="font-display text-3xl font-bold break-words text-berry">🎁 {data.giftee}</p>
          {data.themeId && (
            <p className="text-sm">
              {t('reveal.theme')}: <strong>{data.themeLabel ?? themeLabel(data.themeId, uiLocale)}</strong>
            </p>
          )}
          <p className="note">{t('reveal.secret')}</p>
          <button
            type="button"
            onClick={() => setShown(false)}
            className="btn btn-neutral btn-sm mx-auto"
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
          className="flex min-h-56 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-berry bg-surface p-6 text-ink active:scale-[0.98]"
        >
          <img src={`${import.meta.env.BASE_URL}icon.png`} alt="" className="h-24 w-24" />
          <span className="font-display text-xl font-bold">{t('reveal.tapToReveal')}</span>
          <span className="note">{t('reveal.tapHint')}</span>
        </button>
      )}

      <div className="card">
        <h3 className="card-title">🎄 {party.name}</h3>
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
          <dt className="font-bold text-muted">{t('reveal.whosComing')}</dt>
          <dd>{data.participantNames.join(', ')}</dd>
        </dl>
      </div>
    </section>
  )
}
