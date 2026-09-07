import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModeToggle } from '../ModeToggle'
import { renderWithProviders } from '../../../test/utils'

describe('ModeToggle', () => {
  it('renders both mode buttons and the current label', () => {
    renderWithProviders(<ModeToggle />)
    expect(screen.getByRole('button', { name: /Prototype/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Build/ })).toBeInTheDocument()
    expect(screen.getByText('Dummy Data')).toBeInTheDocument()
  })

  it('switches to build when the Build button is clicked', async () => {
    const user = userEvent.setup()
    const view = renderWithProviders(<ModeToggle />)
    await user.click(screen.getByRole('button', { name: /Build/ }))
    expect(screen.getByText('Live API')).toBeInTheDocument()
    expect(localStorage.getItem('apix_mode')).toBe('build')
    expect(view.container).toBeTruthy()
  })
})