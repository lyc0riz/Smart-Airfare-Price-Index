import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils'
import { Home } from '../Home'

describe('Home page', () => {
  it('renders the headline and a mode indicator', () => {
    renderWithProviders(<Home />)
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/Prototype data mode/)).toBeInTheDocument()
  })

  it('renders the explore cards with working links', () => {
    renderWithProviders(<Home />, { route: '/home' })
    const explore = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(explore).toContain('/airfare-index')
    expect(explore).toContain('/route-analytics')
  })

  it('renders the method steps', () => {
    renderWithProviders(<Home />)
    expect(screen.getByText('Collect')).toBeInTheDocument()
    expect(screen.getByText('Clean')).toBeInTheDocument()
    expect(screen.getByText('Weight')).toBeInTheDocument()
    expect(screen.getByText('Calculate')).toBeInTheDocument()
  })
})