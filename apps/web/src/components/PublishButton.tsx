'use client'

import { Button, useDocumentInfo } from '@payloadcms/ui'
import React, { useState } from 'react'

type Result = { message: string; menuUrl?: string; actionsUrl?: string; changed?: boolean }

export function PublishButton() {
  const { id } = useDocumentInfo()
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<Result | null>(null)

  if (!id) return null

  const publish = async () => {
    setState('busy')
    setResult(null)
    try {
      const res = await fetch(`/api/restaurants/${id}/publish`, { method: 'POST', credentials: 'include' })
      const data = (await res.json()) as Result
      setResult(data)
      setState(res.ok ? 'done' : 'error')
    } catch {
      setResult({ message: 'No se pudo conectar con el panel. ¿Sigue encendida la notebook?' })
      setState('error')
    }
  }

  return (
    <div
      style={{
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 8,
        padding: '16px 18px',
        marginBottom: 24,
        display: 'grid',
        gap: 8,
      }}
    >
      <strong style={{ fontSize: 15 }}>Publicar el menú</strong>
      <span style={{ color: 'var(--theme-elevation-600)', fontSize: 13 }}>
        Guardá tus cambios y después publicá. El menú del QR se actualiza en 1 a 2 minutos.
      </span>
      <div>
        <Button buttonStyle="primary" size="medium" onClick={publish} disabled={state === 'busy'}>
          {state === 'busy' ? 'Publicando…' : 'Publicar ahora'}
        </Button>
      </div>
      {result && (
        <div
          role="status"
          style={{ fontSize: 13, color: state === 'error' ? 'var(--theme-error-500)' : 'var(--theme-success-500)' }}
        >
          {result.message}{' '}
          {result.menuUrl && (
            <a href={result.menuUrl} target="_blank" rel="noreferrer">
              Ver el menú
            </a>
          )}
          {result.changed && result.actionsUrl && (
            <>
              {' · '}
              <a href={result.actionsUrl} target="_blank" rel="noreferrer">
                Ver el progreso
              </a>
            </>
          )}
        </div>
      )}
    </div>
  )
}
