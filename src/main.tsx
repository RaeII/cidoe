import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Deploy novo apaga chunks antigos: aba aberta antes pede hash que não existe mais.
// Reload pega o index.html novo. Janela de 10s evita loop se o chunk faltar de verdade.
window.addEventListener('vite:preloadError', (event) => {
  const last = Number(sessionStorage.getItem('chunk-reload-at'))
  if (Date.now() - last < 10_000) return
  sessionStorage.setItem('chunk-reload-at', String(Date.now()))
  event.preventDefault()
  window.location.reload()
})

const root = document.getElementById('root')!
const app = (
  <StrictMode>
    <App />
  </StrictMode>
)
if (import.meta.env.PROD && root.hasChildNodes()) hydrateRoot(root, app)
else createRoot(root).render(app)
