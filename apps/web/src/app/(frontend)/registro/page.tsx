import type { Metadata } from 'next'

import { FREE_MAX_DISHES } from '../../../plans'
import { RegistroForm } from './RegistroForm'
import './registro.css'

export const metadata: Metadata = {
  title: 'Creá tu local gratis · Mesaverso',
  description: 'Registrate y armá tu menú digital con QR.',
  robots: { index: false },
}

// the legal pages live on the sales site; set MESAVERSO_URL in the panel's environment once the domain exists
const landing = (process.env.MESAVERSO_URL || 'https://mesaverso.app').replace(/\/+$/, '')

export default function RegistroPage() {
  return (
    <div className="reg">
      <h1>Creá tu local</h1>
      <p className="reg__lead">
        Registrate y armá tu menú con hasta {FREE_MAX_DISHES} productos. Antes de que salga al aire lo revisamos nosotros y te avisamos por WhatsApp.
      </p>
      <RegistroForm termsUrl={`${landing}/terminos-gratis/`} privacyUrl={`${landing}/privacidad/`} />
    </div>
  )
}
