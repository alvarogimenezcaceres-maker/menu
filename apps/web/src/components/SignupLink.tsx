import React from 'react'

/** Under the login form: where a new local creates its account. */
export function SignupLink() {
  return (
    <p style={{ marginTop: 20, textAlign: 'center' }}>
      ¿Todavía no tenés cuenta?{' '}
      <a href="/registro" style={{ fontWeight: 600 }}>
        Creá tu local gratis
      </a>
      <br />
      <a href="https://menu.mesaverso.app/legal/privacidad/" target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
        Política de privacidad
      </a>
    </p>
  )
}
