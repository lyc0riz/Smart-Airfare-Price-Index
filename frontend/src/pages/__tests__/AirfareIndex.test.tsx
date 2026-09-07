import { describe, it, expect } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils'
import { AirfareIndex } from '../AirfareIndex'

describe('AirfareIndex page', () => {
  it('renders summary stats and a chart', async () => {
    renderWithProviders(<AirfareIndex />)
    expect(screen.getAllByText(/Change/i).length).toBeGreaterThan(0)
    await waitFor(() => expect(document.querySelector('.recharts-wrapper')).not.toBeNull())
  })

  it('renders sortable route tables', () => {
    renderWithProviders(<AirfareIndex />)
    expect(screen.getAllByRole('table').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('columnheader', { name: /Route/ }).length).toBeGreaterThan(0)
  })

  it('sorts a table when a sort button is clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AirfareIndex />)
    const weightHeader = screen.getAllByRole('columnheader', { name: /DGCA Weight/ })[0]!
    const sortButton = weightHeader.querySelector('button') as HTMLButtonElement
    await user.click(sortButton)
    expect(screen.getAllByRole('columnheader', { name: /DGCA Weight/ })[0]).toHaveAttribute('aria-sort', 'ascending')
  })

  it('filters by airline through the select control', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AirfareIndex />)
    const airlineSelect = screen.getByRole('combobox', { name: /Airline/i })
    await user.selectOptions(airlineSelect, '6E')
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('switches the display frequency', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AirfareIndex />)
    await user.selectOptions(screen.getByRole('combobox', { name: /Frequency/i }), 'weekly')
    await waitFor(() => expect(document.querySelector('.recharts-wrapper')).not.toBeNull())
  })

  it('filters the route table by the selected route and shows a clear badge', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AirfareIndex />)
    expect(screen.getAllByRole('row').length).toBeGreaterThan(2)
    await user.selectOptions(screen.getByRole('combobox', { name: /Route/i }), 'DEL-BOM')
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(2)
    expect(rows[1]).toHaveTextContent('DEL–BOM')
    expect(screen.getByText(/Filtered by DEL–BOM/)).toBeInTheDocument()
  })

  it('clears the route filter and restores the full table', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AirfareIndex />)
    await user.selectOptions(screen.getByRole('combobox', { name: /Route/i }), 'DEL-BLR')
    expect(screen.getAllByRole('row')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: /Clear route filter/i }))
    expect(screen.getAllByRole('row').length).toBeGreaterThan(2)
  })

  it('switches the displayed route in the chart title', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AirfareIndex />)
    await user.selectOptions(screen.getByRole('combobox', { name: /Route/i }), 'BOM-BLR')
    expect(screen.getAllByText(/BOM–BLR \(Mumbai–Bengaluru\)/).length).toBeGreaterThan(1)
  })
})