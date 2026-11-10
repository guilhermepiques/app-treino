import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource/barlow-condensed/latin-600.css'
import '@fontsource/barlow-condensed/latin-700.css'
import './styles.css'
import { App } from './App'
import { db, requestPersistence, seedLibrary } from './db'
import { initSync } from './lib/sync'

registerSW({ immediate: true })

// Só em desenvolvimento: deixa o banco acessível no console para testes.
if (import.meta.env.DEV) Object.assign(window, { db })

seedLibrary()
  .catch((e) => console.error('Falha ao carregar a lista de exercícios', e))
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })

requestPersistence()
initSync()
