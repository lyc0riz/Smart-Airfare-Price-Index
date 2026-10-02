import { describe, it, expect } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils'
import { QueryExplorer } from '../QueryExplorer'

describe('QueryExplorer Page', () => {
  it('renders the header, query input, and quick prompt chips', async () => {
    renderWithProviders(<QueryExplorer />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Natural Language Query Console/i)
    expect(screen.getByPlaceholderText(/Ask anything/i)).toBeInTheDocument()
    expect(screen.getByText(/Cheapest on DEL-BOM/i)).toBeInTheDocument()
    expect(screen.getByText(/Weekly APIx Trend/i)).toBeInTheDocument()
  })

  it('runs query and displays executive summary and structured data table', async () => {
    renderWithProviders(<QueryExplorer />)
    await waitFor(() => {
      expect(screen.getByText(/Executive AI Takeaway/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Structured Data Results/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Export CSV/i })).toBeInTheDocument()
  })

  it('executes query when clicking a suggestion chip', async () => {
    renderWithProviders(<QueryExplorer />)
    const chip = screen.getByText(/Weekly APIx Trend/i)
    fireEvent.click(chip)

    await waitFor(() => {
      expect(screen.getByText(/weekly/i)).toBeInTheDocument()
    })
  })

  it('toggles SQL diagnostics view', async () => {
    renderWithProviders(<QueryExplorer />)
    await waitFor(() => {
      expect(screen.getByText(/SQL Transparency & Sandboxed Execution Diagnostics/i)).toBeInTheDocument()
    })

    const toggleBtn = screen.getByRole('button', { name: /SQL Transparency/i })
    fireEvent.click(toggleBtn)
    // SQL pre block should be hidden
    expect(screen.queryByText(/Generated Read-Only PostgreSQL Statement/i)).not.toBeInTheDocument()

    fireEvent.click(toggleBtn)
    expect(screen.getByText(/Generated Read-Only PostgreSQL Statement/i)).toBeInTheDocument()
  })
})
