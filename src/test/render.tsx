import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { appRoutes } from '../app/router'
import { DatabaseProvider } from '../app/providers/database'

export function renderAt(path: string) {
  const memoryRouter = createMemoryRouter(appRoutes, {
    initialEntries: [path],
  })

  return {
    ...render(
      <DatabaseProvider name="touchline-os-test">
        <RouterProvider router={memoryRouter} />
      </DatabaseProvider>,
    ),
    router: memoryRouter,
  }
}
