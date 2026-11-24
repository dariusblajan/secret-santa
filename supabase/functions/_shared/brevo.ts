export interface Email {
  to: { email: string; name?: string }
  subject: string
  html: string
  text: string
}

/**
 * Send one transactional email through Brevo.
 * With EMAIL_MODE=log (local dev) the email is printed instead of sent.
 * Returns true on success, false on failure (never throws, callers decide what to do).
 */
export async function sendEmail(email: Email): Promise<boolean> {
  if (Deno.env.get('EMAIL_MODE') === 'log') {
    console.log(`[email:log] to=${email.to.email} subject=${email.subject}\n${email.text}`)
    return true
  }

  const apiKey = Deno.env.get('BREVO_API_KEY')
  const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL')
  const senderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'Secret Santa'
  if (!apiKey || !senderEmail) {
    console.error('Brevo is not configured (BREVO_API_KEY / BREVO_SENDER_EMAIL)')
    return false
  }

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [email.to],
        subject: email.subject,
        htmlContent: email.html,
        textContent: email.text,
      }),
    })
    if (!res.ok) {
      console.error('Brevo error', res.status, await res.text())
      return false
    }
    return true
  } catch (err) {
    console.error('Brevo request failed', err)
    return false
  }
}
