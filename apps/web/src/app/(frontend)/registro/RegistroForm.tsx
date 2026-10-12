'use client'

import React, { useState } from 'react'

type Errors = Record<string, string>

const FIELDS = [
  { name: 'firstName', label: 'Nombre', type: 'text', autoComplete: 'given-name' },
  { name: 'lastName', label: 'Apellido', type: 'text', autoComplete: 'family-name' },
  { name: 'email', label: 'Correo', type: 'email', autoComplete: 'email' },
  { name: 'phone', label: 'Celular', type: 'tel', autoComplete: 'tel', hint: 'Ej.: 0981 123 456' },
  { name: 'restaurantName', label: 'Nombre de tu local', type: 'text', autoComplete: 'organization' },
  { name: 'password', label: 'Contraseña', type: 'password', autoComplete: 'new-password', hint: 'Al menos 10 caracteres' },
] as const

export function RegistroForm({ termsUrl, privacyUrl }: { termsUrl: string; privacyUrl: string }) {
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const body: Record<string, unknown> = Object.fromEntries(form.entries())
    body.terms = form.get('terms') === 'on'
    setBusy(true)
    setMessage('')
    setErrors({})
    try {
      const res = await fetch('/api/registro', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = (await res.json().catch(() => ({}))) as { message?: string; errors?: Errors }
      if (res.ok) setDone(true)
      else {
        setErrors(data.errors ?? {})
        setMessage(data.message ?? 'No pudimos crear la cuenta. Probá de nuevo.')
      }
    } catch {
      setMessage('No hay conexión. Probá de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  if (done)
    return (
      <div className="reg__done" role="status">
        <h2>Listo, tu cuenta está creada</h2>
        <p>Entrá con tu correo y tu contraseña, cargá tu menú y pedí la publicación. Nosotros la revisamos y te avisamos por WhatsApp.</p>
        <a className="reg__btn" href="/admin/login">
          Entrar al panel
        </a>
      </div>
    )

  return (
    <form className="reg__form" onSubmit={onSubmit} noValidate>
      {FIELDS.map((f) => (
        <label key={f.name} className="reg__field">
          <span>{f.label}</span>
          <input name={f.name} type={f.type} autoComplete={f.autoComplete} required aria-invalid={Boolean(errors[f.name])} />
          {errors[f.name] ? <small className="reg__err">{errors[f.name]}</small> : 'hint' in f ? <small>{f.hint}</small> : null}
        </label>
      ))}
      {/* honeypot: hidden from people, bots fill it in */}
      <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="reg__trap" />
      <label className="reg__check">
        <input name="terms" type="checkbox" required />
        <span>
          Leí y acepto los{' '}
          <a href={termsUrl} target="_blank" rel="noreferrer">
            términos del plan Gratis
          </a>{' '}
          y el{' '}
          <a href={privacyUrl} target="_blank" rel="noreferrer">
            aviso de privacidad
          </a>
          .
        </span>
      </label>
      {errors.terms ? <small className="reg__err">{errors.terms}</small> : null}
      <p className="reg__note">
        Usamos tu nombre, correo y celular para crear tu cuenta, avisarte sobre tu menú y darte soporte. Podés pedirnos que los borremos. Ojo: tu celular también queda cargado como WhatsApp de pedidos de tu local, y cuando publiques tu menú ese número se va a ver en el menú. Podés cambiarlo en el panel antes de publicar.
      </p>
      {message ? (
        <p className="reg__msg" role="alert">
          {message}
        </p>
      ) : null}
      <button className="reg__btn" type="submit" disabled={busy}>
        {busy ? 'Creando…' : 'Crear mi cuenta'}
      </button>
      <p className="reg__login">
        ¿Ya tenés cuenta? <a href="/admin/login">Entrá acá</a>
      </p>
    </form>
  )
}
