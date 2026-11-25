import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { Locale, ValidationError } from '../../../supabase/functions/_shared/validation.ts'
import PartyForm from '../components/PartyForm'
import { api, ApiError } from '../lib/api'
import { apiErrorMessage } from '../lib/errors'
import { emptyPartyForm, toPartyInput } from '../lib/partyForm'

export default function CreatePartyPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [serverErrors, setServerErrors] = useState<ValidationError[]>([])

  const initial = emptyPartyForm(i18n.language === 'ro' ? 'ro' : ('en' as Locale))

  return (
    <section className="grid gap-6">
      <h2 className="page-title">{t('create.title')}</h2>
      <PartyForm
        mode="create"
        initial={initial}
        submitting={submitting}
        serverErrors={serverErrors}
        formError={formError}
        onSubmit={async (values, accessCode) => {
          setSubmitting(true)
          setFormError(null)
          setServerErrors([])
          try {
            const result = await api.createParty(accessCode, toPartyInput(values))
            navigate(`/manage/${result.adminToken}`, {
              replace: true,
              state: { justCreated: true, emailSent: result.emailSent },
            })
          } catch (err) {
            if (err instanceof ApiError) setServerErrors(err.errors)
            setFormError(apiErrorMessage(t, err))
            setSubmitting(false)
          }
        }}
      />
    </section>
  )
}
