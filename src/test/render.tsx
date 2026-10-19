import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { appRoutes } from '../app/router'

export function renderAt(path: string) {
  const memoryRouter = createMemoryRouter(appRoutes, {
    initialEntries: [path],
  })

  return render(<RouterProvider router={memoryRouter} />)
}
