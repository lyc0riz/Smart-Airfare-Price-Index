import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils'
import { AirfareIndex } from '../AirfareIndex'

describe('AirfareIndex page', () => {
  it('renders summary stats and a chart', () => {
    renderWithProviders(<AirfareIndex />)
    expect(screen.getAllByText(/Change/i).length).toBeGreaterThan(0)
    expect(document.querySelector('.recharts-wrapper')).not.toBeNull()
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
    expect(document.querySelector('.recharts-wrapper')).not.toBeNull()
  })
})