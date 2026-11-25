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
    <div className="grid gap-6">
      {redo && (
        <div className="grid gap-1">
          <h3 className="page-title !text-2xl">{t('redo.title')}</h3>
          <p className="note">{t('redo.intro')}</p>
        </div>
      )}
      <fieldset className="card gap-2">
        <legend className="card-title float-left mb-2 w-full">{t('matching.title')}</legend>
        <label className="flex min-h-11 items-center gap-3">
          <input className="h-5 w-5 accent-berry" type="radio" name="matching" checked={!sameGender} onChange={() => setSameGender(false)} />
          {t('matching.mixed')}
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input className="h-5 w-5 accent-berry" type="radio" name="matching" checked={sameGender} onChange={() => setSameGender(true)} />
          {t('matching.sameGender')}
        </label>
        {sameGender && <p className="note">{t('matching.sameGenderHint')}</p>}
      </fieldset>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="card-title">{t('themes.title')}</h3>
          <div className="flex gap-2">
            <button type="button" className="btn btn-neutral btn-sm" onClick={() => updateThemes(THEMES.map((x) => x.id))}>
              {t('themes.selectAll')}
            </button>
            <button type="button" className="btn btn-neutral btn-sm" onClick={() => updateThemes([])}>
              {t('themes.selectNone')}
            </button>
          </div>
        </div>
        <p className="note">{t('themes.hint')}</p>
        <p className="pill w-fit" role="status">
          {t('themes.counter', { selected: themeIds.length, needed: participants.length })}
        </p>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('themes.search')}
          placeholder={t('themes.search')}
          className="input"
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
                  className={`min-h-11 rounded-full border-[1.5px] px-4 text-sm font-bold ${
                    on
                      ? 'border-berry bg-berry text-white'
                      : 'border-line bg-surface text-muted hover:border-[#c9b9a5]'
                  }`}
                >
                  {themeLabel(theme.id, uiLocale, customThemes)}
                </button>
                {theme.custom && (
                  <button
                    type="button"
                    aria-label={t('themes.remove', { name: themeLabel(theme.id, uiLocale, customThemes) })}
                    onClick={() => customAction(() => api.removeTheme(token, theme.id))}
                    className="-ml-2 min-h-11 rounded-r-full border-[1.5px] border-l-0 border-line bg-surface px-3 text-base font-bold text-muted hover:text-danger"
                  >
                    ×
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        <form onSubmit={addCustom} className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            maxLength={CUSTOM_THEME_LIMITS.maxLabelLength}
            aria-label={t('themes.customLabel')}
            placeholder={t('themes.customPlaceholder')}
            className="input min-w-0"
          />
          <button
            type="submit"
            disabled={!newLabel.trim() || customThemes.length >= CUSTOM_THEME_LIMITS.maxCount}
            className="btn btn-secondary"
          >
            {t('themes.add')}
          </button>
        </form>
        <p className="note">{t('themes.customHint', { max: CUSTOM_THEME_LIMITS.maxCount })}</p>
      </section>

      <ExclusionsPanel token={token} data={data} onChange={onChange} />

      <div className="grid gap-3">
        {blocked && (
          <div
            role="status"
            className="callout callout-warn grid gap-1"
          >
            <p className="font-bold">⚠️ {t(`${k}.warningTitle`)}</p>
            <ul className="list-disc space-y-1 pl-5">
              {issues.map((issue, i) => (
                <li key={i}>{issueMessage(t, issue)}</li>
              ))}
            </ul>
          </div>
        )}
        {done && (
          <p className="callout callout-ok font-bold" role="status">
            ✓ {t('redo.done')}
          </p>
        )}
        {error && (
          <p className="callout callout-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={blocked || starting}
          onClick={() => setConfirming(true)}
          className="btn btn-primary btn-block sm:w-auto sm:min-w-56 sm:justify-self-end"
        >
          {starting ? t('start.starting') : t(`${k}.button`)}
        </button>
      </div>

      {confirming && (
        <div
          className="modal-backdrop"
          onKeyDown={(e) => e.key === 'Escape' && !starting && setConfirming(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="start-title"
            className="modal grid max-w-md gap-4"
          >
            <h3 id="start-title" className="card-title">
              {t(`${k}.dialogTitle`)}
            </h3>
            <p className="text-[15px]">{t(`${k}.dialogBody`, { count: participants.length })}</p>
            <div className="grid grid-cols-2 gap-3 sm:flex sm:justify-end">
              <button
                ref={cancelRef}
                type="button"
                disabled={starting}
                onClick={() => setConfirming(false)}
                className="btn btn-neutral"
              >
                {t('start.dialogCancel')}
              </button>
              <button
                type="button"
                disabled={starting}
                onClick={() => void start()}
                className="btn btn-primary"
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
