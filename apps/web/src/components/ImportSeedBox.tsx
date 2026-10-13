'use client'

import React, { useState } from 'react'

type Result = { ok?: boolean; message?: string; restaurant?: string; categories?: number; dishes?: number; photos?: number; inviteUrl?: string }

/** Platform admins: bring a restaurant from seed/<slug>/ into the panel and get its one-time activation link. */
export function ImportSeedBox() {
  const [slug, setSlug] = useState('')
  const [plan, setPlan] = useState('menu')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<Result | null>(null)
  const [copied, setCopied] = useState(false)

  const run = async () => {
    setBusy(true)
    setRes(null)
    setCopied(false)
    try {
      const r = await fetch('/api/restaurants/import-seed', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: slug.trim(), plan }) })
      setRes((await r.json().catch(() => ({ message: `Error ${r.status}` }))) as Result)
    } catch {
      setRes({ message: 'No se pudo conectar con el panel.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <details style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 8, padding: '14px 18px', marginBottom: 24 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Importar un local nuevo desde el repositorio</summary>
      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        <span style={{ color: 'var(--theme-elevation-600)', fontSize: 13 }}>
          Carga el menú de <code>seed/&lt;identificador&gt;/</code> (platos, fotos y logo) y te da un link de activación de un solo uso para que el dueño cree su acceso con su propio correo y contraseña.
        </span>
        <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="Identificador, por ejemplo frakar" aria-label="Identificador del local" style={{ minHeight: 44, padding: '0 12px' }} />
        <select value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Plan" style={{ minHeight: 44, padding: '0 12px' }}>
          <option value="menu">Plan Menú (sin límites de carga)</option>
          <option value="pedidos">Plan Pedidos</option>
          <option value="salon">Plan Salón</option>
          <option value="free">Plan Gratis (con sus límites)</option>
        </select>
        <div>
          <button type="button" onClick={run} disabled={busy || !slug.trim()} style={{ minHeight: 44, padding: '0 20px', fontWeight: 700, cursor: 'pointer' }}>
            {busy ? 'Importando…' : 'Importar local'}
          </button>
        </div>
        {res && (
          <div role="status" style={{ fontSize: 14, color: res.ok ? 'var(--theme-success-500)' : 'var(--theme-error-500)', display: 'grid', gap: 6 }}>
            {res.ok ? (
              <>
                <span>
                  Listo: {res.restaurant} ({res.categories} categorías, {res.dishes} platos, {res.photos} fotos). Mandale este link al dueño; sirve una sola vez:
                </span>
                <code style={{ wordBreak: 'break-all', color: 'var(--theme-text)' }}>{res.inviteUrl}</code>
                <div>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(res.inviteUrl || '').then(() => setCopied(true)).catch(() => {})}
                    style={{ minHeight: 40, padding: '0 16px', cursor: 'pointer' }}
                  >
                    {copied ? 'Copiado ✓' : 'Copiar el link'}
                  </button>
                </div>
              </>
            ) : (
              <span>{res.message || 'No se pudo importar.'}</span>
            )}
          </div>
        )}
      </div>
    </details>
  )
}
