import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { previewBanner } from '../app/copy'
import { workspaceSections } from '../app/routes'
import { renderAt } from './render'

describe('shell nav', () => {
  it('lists every section and the preview banner', () => {
    renderAt('/app/demo/command-center')

    for (const section of workspaceSections) {
      expect(
        screen.getByRole('link', { name: section.label }),
      ).toBeInTheDocument()
    }

    expect(screen.getByText(previewBanner)).toBeInTheDocument()
  })
})
