import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { THEMES, themeLabel } from '../../../supabase/functions/_shared/themes.ts'
import { api, type ManageData } from '../lib/api'
import { apiErrorMessage } from '../lib/errors'
import { issueMessage, startIssues } from '../lib/preflight'

interface Props {
  token: string
  data: ManageData
  onChange: (data: ManageData) => void
}

export default function StartPanel({ token, data, onChange }: Props) {
  const { t, i18n } = useTranslation()
  const uiLocale = i18n.language === 'ro' ? 'ro' : 'en'
  const { participants } = data

  const [sameGender, setSameGender] = useState(data.party.sameGender)
  const [themeIds, setThemeIds] = useState<string[]>(data.party.themeIds)
  const [confirming, setConfirming] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Theme changes are saved one after another so the last click always wins.
  const saveChain = useRef<Promise<unknown>>(Promise.resolve())
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (confirming) cancelRef.current?.focus()
  }, [confirming])

  function updateThemes(next: string[]) {
    setThemeIds(next)
    setError(null)
    saveChain.current = saveChain.current
      .then(() => api.setThemes(token, next))
      .catch((err) => setError(apiErrorMessage(t, err)))
  }

  const toggleTheme = (id: string) =>
    updateThemes(themeIds.includes(id) ? themeIds.filter((x) => x !== id) : [...themeIds, id])

  const issues = startIssues(participants, themeIds.length, sameGender)
  const blocked = issues.length > 0

  async function start() {
    setStarting(true)
    setError(null)
    try {
      await saveChain.current // make sure the latest theme selection is stored first
      onChange(await api.startParty(token, sameGender))
    } catch (err) {
      setError(apiErrorMessage(t, err))
      setConfirming(false)
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="space-y-8">
      <fieldset className="space-y-2">
        <legend className="text-lg font-semibold">{t('matching.title')}</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="matching" checked={!sameGender} onChange={() => setSameGender(false)} />
          {t('matching.mixed')}
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="matching" checked={sameGender} onChange={() => setSameGender(true)} />
          {t('matching.sameGender')}
        </label>
        {sameGender && <p className="text-xs text-neutral-500">{t('matching.sameGenderHint')}</p>}
      </fieldset>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold">{t('themes.title')}</h3>
          <div className="flex gap-3 text-sm">
            <button type="button" className="underline" onClick={() => updateThemes(THEMES.map((x) => x.id))}>
              {t('themes.selectAll')}
            </button>
            <button type="button" className="underline" onClick={() => updateThemes([])}>
              {t('themes.selectNone')}
            </button>
          </div>
        </div>
        <p className="text-xs text-neutral-500">{t('themes.hint')}</p>
        <p className="text-sm" role="status">
          {t('themes.counter', { selected: themeIds.length, needed: participants.length })}
        </p>
        <ul className="flex flex-wrap gap-2">
          {THEMES.map((theme) => {
            const on = themeIds.includes(theme.id)
            return (
              <li key={theme.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleTheme(theme.id)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    on
                      ? 'border-red-700 bg-red-700 text-white'
                      : 'border-neutral-300 text-neutral-600 hover:border-neutral-500'
                  }`}
                >
                  {themeLabel(theme.id, uiLocale)}
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <div className="space-y-3">
        {blocked && (
          <div
            role="status"
            className="space-y-1 rounded border border-amber-500 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-50"
          >
            <p className="font-medium">⚠️ {t('start.warningTitle')}</p>
            <ul className="list-disc space-y-1 pl-5">
              {issues.map((issue, i) => (
                <li key={i}>{issueMessage(t, issue)}</li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={blocked || starting}
          onClick={() => setConfirming(true)}
          className="rounded bg-red-700 px-5 py-2 font-medium text-white disabled:opacity-50"
        >
          {starting ? t('start.starting') : t('start.button')}
        </button>
      </div>

      {confirming && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4"
          onKeyDown={(e) => e.key === 'Escape' && !starting && setConfirming(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="start-title"
            className="w-full max-w-md space-y-4 rounded bg-white p-6 text-neutral-900 shadow-lg"
          >
            <h3 id="start-title" className="text-lg font-semibold">
              {t('start.dialogTitle')}
            </h3>
            <p className="text-sm">{t('start.dialogBody', { count: participants.length })}</p>
            <div className="flex justify-end gap-3">
              <button
                ref={cancelRef}
                type="button"
                disabled={starting}
                onClick={() => setConfirming(false)}
                className="rounded border border-neutral-300 px-4 py-2"
              >
                {t('start.dialogCancel')}
              </button>
              <button
                type="button"
                disabled={starting}
                onClick={() => void start()}
                className="rounded bg-red-700 px-4 py-2 font-medium text-white disabled:opacity-60"
              >
                {starting ? t('start.starting') : t('start.dialogConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
