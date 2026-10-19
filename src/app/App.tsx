import { RouterProvider } from 'react-router'
import { router } from './router'
import { DatabaseProvider } from './providers/database'

export function App() {
  return (
    <DatabaseProvider>
      <RouterProvider router={router} />
    </DatabaseProvider>
  )
}
