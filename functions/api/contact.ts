// Cloudflare Pages Function for the contact form on /about.
// POST /api/contact { name, email, message } → sends email via Resend.
//
// Required Pages env vars (Cloudflare → Pages → shariq-dev → Settings → Environment variables):
//   RESEND_API_KEY  — Resend API key
//   CONTACT_FROM    — verified sender, e.g. "contact@shariq.dev"
//   CONTACT_TO      — destination inbox, e.g. "hello@shariq.dev"
//
// Until RESEND_API_KEY is set, this function returns 503; the form surfaces
// the "couldn't send" fallback so the user knows to email directly.

interface Env {
  RESEND_API_KEY?: string
  CONTACT_FROM?: string
  CONTACT_TO?: string
}

interface Context {
  request: Request
  env: Env
}

type Payload = { name?: string; email?: string; message?: string }

export const onRequestPost = async ({ request, env }: Context): Promise<Response> => {
  let data: Payload
  try {
    data = await request.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const name = String(data.name ?? '')
    .trim()
    .slice(0, 200)
  const email = String(data.email ?? '')
    .trim()
    .slice(0, 200)
  const message = String(data.message ?? '')
    .trim()
    .slice(0, 5000)

  if (!email || !message) {
    return json({ error: 'Email and message are required.' }, 400)
  }

  // Basic email shape check; not a guarantee, just a sanity floor.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Email looks malformed.' }, 400)
  }

  if (!env.RESEND_API_KEY || !env.CONTACT_FROM || !env.CONTACT_TO) {
    // Not configured yet — surface a 503 so the form falls back gracefully.
    return json({ error: 'Contact endpoint not configured yet.' }, 503)
  }

  const subject = `shariq.dev contact: ${name || email}`
  const body = `From: ${
    name || '(no name)'
  } <${email}>\n\n${message}\n\n--\nSent from the /about contact form on shariq.dev.`

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.CONTACT_FROM,
      to: env.CONTACT_TO,
      reply_to: email,
      subject,
      text: body,
    }),
  })

  if (!r.ok) {
    const detail = await r.text()
    console.error('Resend error:', r.status, detail)
    return json({ error: 'Email service rejected the request.' }, 502)
  }

  return json({ ok: true }, 200)
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
