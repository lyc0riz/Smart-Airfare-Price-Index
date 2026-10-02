import { describe, it, expect } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test/utils'
import { DataExplorer } from '../DataExplorer'

describe('DataExplorer Page with Integrated AI Query & SQL Sandbox', () => {
  it('renders tab list including AI Query, SQL Sandbox, Route Observations, and Quotes', () => {
    renderWithProviders(<DataExplorer />)
    expect(screen.getByRole('tab', { name: /AI Natural Language Query/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /SQL Sandbox \(Read-Only\)/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Route Observations/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Latest Observed Quotes/i })).toBeInTheDocument()
  })

  it('runs initial NLQ query and displays AI takeaway and structured table', async () => {
    renderWithProviders(<DataExplorer />)
    await waitFor(() => {
      expect(screen.getByText(/Executive AI Takeaway/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Structured Data Results/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Run Query/i })).toBeInTheDocument()
  })

  it('executes NLQ query when clicking Run Query button', async () => {
    renderWithProviders(<DataExplorer />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Run Query/i })).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/Ask anything/i)
    fireEvent.change(input, { target: { value: 'Compare average fares on all routes' } })

    const runBtn = screen.getByRole('button', { name: /Run Query/i })
    fireEvent.click(runBtn)

    await waitFor(() => {
      expect(screen.getByText(/Comparison across the 6 DGCA representative/i)).toBeInTheDocument()
    })
  })

  it('switches to SQL Sandbox tab and executes read-only SQL', async () => {
    renderWithProviders(<DataExplorer />)
    const sqlTab = screen.getByRole('tab', { name: /SQL Sandbox/i })
    fireEvent.click(sqlTab)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Execute SQL/i })).toBeInTheDocument()
    })
    expect(screen.getByText(/Interactive Read-Only SQL Console/i)).toBeInTheDocument()

    const execBtn = screen.getByRole('button', { name: /Execute SQL/i })
    fireEvent.click(execBtn)

    await waitFor(() => {
      expect(screen.getByText(/Query Execution Results/i)).toBeInTheDocument()
      expect(screen.getByText(/SUCCESS/i)).toBeInTheDocument()
    })
  })

  it('blocks mutation queries in SQL Sandbox', async () => {
    renderWithProviders(<DataExplorer />)
    const sqlTab = screen.getByRole('tab', { name: /SQL Sandbox/i })
    fireEvent.click(sqlTab)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Execute SQL/i })).toBeInTheDocument()
    })

    const securityTmpl = screen.getByRole('button', { name: /Test Security Guard/i })
    fireEvent.click(securityTmpl)

    await waitFor(() => {
      expect(screen.getByText(/BLOCKED/i)).toBeInTheDocument()
    })
  })

  it('switches to Route Observations tab', async () => {
    renderWithProviders(<DataExplorer />)
    const routesTab = screen.getByRole('tab', { name: /Route Observations/i })
    fireEvent.click(routesTab)

    expect(screen.getByText(/Route Observations/i, { selector: 'h2' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Search route/i)).toBeInTheDocument()
  })
})
