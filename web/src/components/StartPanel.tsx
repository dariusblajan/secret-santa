import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CUSTOM_THEME_LIMITS, THEMES, themeLabel } from '../../../supabase/functions/_shared/themes.ts'
import ExclusionsPanel from './ExclusionsPanel'
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
  const redo = data.party.status === 'drawn'
  const k = redo ? 'redo' : 'start'

  const [sameGender, setSameGender] = useState(data.party.sameGender)
  const [themeIds, setThemeIds] = useState<string[]>(data.party.themeIds)
  const [customThemes, setCustomThemes] = useState(data.party.customThemes)
  const [newLabel, setNewLabel] = useState('')
  const [search, setSearch] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

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

  // Custom themes change the pool too, so they wait for pending toggles and then take the server's answer.
  function customAction(run: () => Promise<ManageData>, after?: () => void) {
    setError(null)
    saveChain.current = saveChain.current
      .then(run)
      .then((next) => {
        setCustomThemes(next.party.customThemes)
        setThemeIds(next.party.themeIds)
        onChange(next)
        after?.()
      })
      .catch((err) => setError(apiErrorMessage(t, err)))
  }

  function addCustom(e: FormEvent) {
    e.preventDefault()
    const label = newLabel.trim()
    if (label) customAction(() => api.addTheme(token, label), () => setNewLabel(''))
  }

  const toggleTheme = (id: string) =>
    updateThemes(themeIds.includes(id) ? themeIds.filter((x) => x !== id) : [...themeIds, id])

  const issues = startIssues(participants, themeIds.length, sameGender, data.exclusions)
  const blocked = issues.length > 0

  async function start() {
    setStarting(true)
    setError(null)
    setDone(false)
    try {
      await saveChain.current // make sure the latest theme selection is stored first
      onChange(await (redo ? api.redoDraw(token, sameGender) : api.startParty(token, sameGender)))
      setConfirming(false)
      setDone(redo)
    } catch (err) {
      setError(apiErrorMessage(t, err))
      setConfirming(false)
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="space-y-8">
      {redo && (
        <div className="space-y-1">
          <h3 className="text-xl font-semibold">{t('redo.title')}</h3>
          <p className="text-sm text-neutral-600">{t('redo.intro')}</p>
        </div>
      )}
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
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('themes.search')}
          placeholder={t('themes.search')}
          className="w-full rounded border border-neutral-300 px-3 py-1 text-sm"
        />
        <ul className="flex flex-wrap gap-2">
          {[...THEMES.map((x) => ({ id: x.id, custom: false })), ...customThemes.map((x) => ({ id: x.id, custom: true }))]
            .filter((x) => themeLabel(x.id, uiLocale, customThemes).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
            .map((theme) => {
            const on = themeIds.includes(theme.id)
            return (
              <li key={theme.id} className="flex">
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
                  {themeLabel(theme.id, uiLocale, customThemes)}
                </button>
                {theme.custom && (
                  <button
                    type="button"
                    aria-label={t('themes.remove', { name: themeLabel(theme.id, uiLocale, customThemes) })}
                    onClick={() => customAction(() => api.removeTheme(token, theme.id))}
                    className="-ml-2 rounded-r-full border border-l-0 border-neutral-300 px-2 text-sm text-neutral-600 hover:text-red-700"
                  >
                    ×
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        <form onSubmit={addCustom} className="flex flex-wrap gap-2">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            maxLength={CUSTOM_THEME_LIMITS.maxLabelLength}
            aria-label={t('themes.customLabel')}
            placeholder={t('themes.customPlaceholder')}
            className="min-w-0 flex-1 rounded border border-neutral-300 px-3 py-1 text-sm"
          />
          <button
            type="submit"
            disabled={!newLabel.trim() || customThemes.length >= CUSTOM_THEME_LIMITS.maxCount}
            className="rounded border border-neutral-300 px-3 py-1 text-sm disabled:opacity-50"
          >
            {t('themes.add')}
          </button>
        </form>
        <p className="text-xs text-neutral-500">{t('themes.customHint', { max: CUSTOM_THEME_LIMITS.maxCount })}</p>
      </section>

      <ExclusionsPanel token={token} data={data} onChange={onChange} />

      <div className="space-y-3">
        {blocked && (
          <div
            role="status"
            className="space-y-1 rounded border border-amber-500 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-50"
          >
            <p className="font-medium">⚠️ {t(`${k}.warningTitle`)}</p>
            <ul className="list-disc space-y-1 pl-5">
              {issues.map((issue, i) => (
                <li key={i}>{issueMessage(t, issue)}</li>
              ))}
            </ul>
          </div>
        )}
        {done && (
          <p className="text-sm text-green-700" role="status">
            ✓ {t('redo.done')}
          </p>
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
          {starting ? t('start.starting') : t(`${k}.button`)}
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
              {t(`${k}.dialogTitle`)}
            </h3>
            <p className="text-sm">{t(`${k}.dialogBody`, { count: participants.length })}</p>
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
                {starting ? t('start.starting') : t(`${k}.dialogConfirm`)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
