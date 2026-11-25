import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Route, Routes } from 'react-router-dom'
import { LANGUAGES, setLanguage, type Language } from './i18n'
import { api, isBackendConfigured } from './lib/api'
import CreatePartyPage from './pages/CreatePartyPage'
import ManagePage from './pages/ManagePage'
import RevealPage from './pages/RevealPage'

function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  return (
    <label className="flex items-center">
      <span className="sr-only">{t('language.label')}</span>
      <select
        value={i18n.language}
        onChange={(e) => setLanguage(e.target.value as Language)}
        className="h-10 cursor-pointer appearance-none rounded-full border-[1.5px] border-white bg-transparent bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2212%22%20height=%228%22%20viewBox=%220%200%2012%208%22%3E%3Cpath%20d=%22M1%201l5%205%205-5%22%20fill=%22none%22%20stroke=%22%23fff%22%20stroke-width=%222%22/%3E%3C/svg%3E')] bg-[length:12px_8px] bg-[right_12px_center] bg-no-repeat pr-8 pl-3.5 text-sm font-bold text-white"
        aria-label={t('language.label')}
      >
        {LANGUAGES.map((lang) => (
          <option key={lang} value={lang} className="text-ink">
            {t(`language.${lang}`)}
          </option>
        ))}
      </select>
    </label>
  )
}

type HealthState = 'checking' | 'ok' | 'error' | 'notConfigured'

function HealthStatus() {
  const { t } = useTranslation()
  const [state, setState] = useState<HealthState>(isBackendConfigured ? 'checking' : 'notConfigured')

  useEffect(() => {
    if (!isBackendConfigured) return
    let cancelled = false
    api
      .health()
      .then(() => !cancelled && setState('ok'))
      .catch(() => !cancelled && setState('error'))
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <p className="note" role="status">
      <span className="font-bold">{t('health.title')}:</span> {t(`health.${state}`)}
    </p>
  )
}

function Home() {
  const { t } = useTranslation()
  return (
    <section className="card gap-5 p-6 text-center">
      <img src={`${import.meta.env.BASE_URL}icon.png`} alt="" className="mx-auto h-28 w-28" />
      <h2 className="page-title">{t('home.welcome')}</h2>
      <p className="mx-auto max-w-prose text-muted">{t('home.intro')}</p>
      <Link to="/create" className="btn btn-primary btn-block sm:mx-auto sm:w-auto sm:min-w-56">
        {t('home.create')}
      </Link>
      <HealthStatus />
    </section>
  )
}

function NotFound() {
  const { t } = useTranslation()
  return (
    <section className="grid gap-4">
      <h2 className="page-title">{t('notFound.title')}</h2>
      <Link to="/" className="btn btn-neutral sm:w-fit">
        {t('notFound.back')}
      </Link>
    </section>
  )
}

export default function App() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-screen flex-col">
      <header className="relative bg-berry text-white shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex min-h-11 items-center gap-2.5 font-display text-xl font-bold text-white no-underline">
            <img
              src={`${import.meta.env.BASE_URL}icon.png`}
              alt=""
              className="h-9 w-9 rounded-[10px] bg-[#fff8ee] p-0.5"
            />
            {t('app.title')}
          </Link>
          <LanguageSwitcher />
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-x-0 -bottom-1.5 h-1.5 bg-[repeating-linear-gradient(135deg,var(--color-pine)_0_14px,var(--color-gold)_14px_28px)]"
        />
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-10 pb-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<CreatePartyPage />} />
          <Route path="/manage/:token" element={<ManagePage />} />
          <Route path="/reveal/:token" element={<RevealPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="px-4 py-6 text-center text-xs text-muted">{t('app.tagline')}</footer>
    </div>
  )
}
