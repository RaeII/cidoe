import { useSyncExternalStore } from 'react'

type Theme = 'light' | 'dark'

// Fonte da verdade é a classe .dark no <html> — a mesma que o script anti-FOUC
// do index.html seta antes do React montar. Todos os consumidores do hook leem
// dela, então N componentes ficam sincronizados sem provider.
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function toggle() {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark'
  document.documentElement.classList.toggle('dark', next === 'dark')
  localStorage.setItem('theme', next)
  listeners.forEach((listener) => listener())
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme)
  return { theme, toggle }
}
