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
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">{t('language.label')}</span>
      <select
        value={i18n.language}
        onChange={(e) => setLanguage(e.target.value as Language)}
        className="rounded border border-neutral-300 bg-transparent px-2 py-1"
        aria-label={t('language.label')}
      >
        {LANGUAGES.map((lang) => (
          <option key={lang} value={lang}>
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
    <p className="text-sm text-neutral-500" role="status">
      <span className="font-medium">{t('health.title')}:</span> {t(`health.${state}`)}
    </p>
  )
}

function Home() {
  const { t } = useTranslation()
  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-semibold">{t('home.welcome')}</h2>
      <p>{t('home.intro')}</p>
      <Link to="/create" className="inline-block rounded bg-red-700 px-5 py-2 font-medium text-white">
        {t('home.create')}
      </Link>
      <HealthStatus />
    </section>
  )
}

function NotFound() {
  const { t } = useTranslation()
  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">{t('notFound.title')}</h2>
      <Link to="/" className="underline">
        {t('notFound.back')}
      </Link>
    </section>
  )
}

export default function App() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4">
      <header className="flex items-center justify-between border-b border-neutral-200 py-4">
        <Link to="/" className="text-lg font-bold">
          🎁 {t('app.title')}
        </Link>
        <LanguageSwitcher />
      </header>
      <main className="flex-1 py-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<CreatePartyPage />} />
          <Route path="/manage/:token" element={<ManagePage />} />
          <Route path="/reveal/:token" element={<RevealPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="py-4 text-center text-xs text-neutral-500">{t('app.tagline')}</footer>
    </div>
  )
}
