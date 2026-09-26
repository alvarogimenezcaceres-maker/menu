import { redirect } from 'next/navigation'

// The public menu is the static site on GitHub Pages; this app is only the admin panel.
export default function HomePage() {
  redirect('/admin')
}
