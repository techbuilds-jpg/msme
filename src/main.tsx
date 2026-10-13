import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import { installErrorReporting } from './lib/reportError'
import './index.css'

installErrorReporting()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
