import { useTranslation } from 'react-i18next'

export default function Loading() {
  const { t } = useTranslation()
  const label = t('common.loading')
  return (
    <div role="status" aria-live="polite" className="flex min-h-[55vh] flex-col items-center justify-center gap-5 text-center">
      <span className="sr-only">{label}</span>
      <svg viewBox="0 0 100 150" className="ld-swing ld-size" aria-hidden="true">
        <line x1="50" y1="0" x2="50" y2="34" stroke="#c9a54a" strokeWidth="2" />
        <rect x="40" y="30" width="20" height="12" rx="3" fill="#e9c46a" />
        <circle cx="50" cy="94" r="48" fill="#b3202a" />
        <path d="M8 86 Q50 112 92 86" fill="none" stroke="#e9c46a" strokeWidth="6" />
        <path d="M10 104 Q50 130 90 104" fill="none" stroke="#2f6b47" strokeWidth="5" />
        <ellipse cx="32" cy="68" rx="9" ry="15" fill="#fff" opacity="0.28" transform="rotate(25 32 68)" />
      </svg>
      <p className="note font-display text-base" aria-hidden="true">
        {label}
      </p>
    </div>
  )
}
