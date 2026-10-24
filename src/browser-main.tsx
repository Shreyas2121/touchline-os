import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { DatabaseProvider } from './app/providers/database'
import { router } from './app/router'
import './styles/global.css'

const rootElement = document.getElementById('root')

if (!rootElement) throw new Error('Root element #root is missing')

createRoot(rootElement).render(
  <StrictMode>
    <DatabaseProvider>
      <RouterProvider router={router} />
    </DatabaseProvider>
  </StrictMode>,
)
