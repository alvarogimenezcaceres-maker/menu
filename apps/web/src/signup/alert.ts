import { createHmac } from 'node:crypto'

// Mails the owner when someone signs up (or tries and fails), through the landing Worker's POST /api/alert,
// which reuses the lead e-mail transport. Signed with ALERT_SECRET (same value in Render and in the
// mesaverso-landing Worker). Fire-and-forget: a failure here never blocks or slows the signup.
// Never sends the password.
export function signupAlert(title: string, fields: Record<string, unknown>, replyTo?: string): void {
  const secret = process.env.ALERT_SECRET
  if (!secret) return
  const url = process.env.ALERT_URL || 'https://mesaverso.app/api/alert'
  const body = JSON.stringify({ title, fields, replyTo })
  const ts = String(Date.now())
  const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')
  void fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mv-ts': ts, 'x-mv-signature': sig },
    body,
    signal: AbortSignal.timeout(5000),
  }).catch(() => {})
}

// what the person typed, without the password, for «tried and failed» alerts
export function typedFields(body: unknown): Record<string, unknown> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const s = (k: string) => (typeof b[k] === 'string' ? (b[k] as string).slice(0, 120) : undefined)
  return { Nombre: [s('firstName'), s('lastName')].filter(Boolean).join(' '), Local: s('restaurantName'), Correo: s('email'), Celular: s('phone') }
}
