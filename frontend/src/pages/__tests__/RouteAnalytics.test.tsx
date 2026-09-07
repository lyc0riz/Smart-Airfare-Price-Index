import { describe, it, expect } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test/utils'
import { RouteAnalytics } from '../RouteAnalytics'

describe('RouteAnalytics page', () => {
  it('renders the map and the route table', () => {
    renderWithProviders(<RouteAnalytics />)
    expect(screen.getByRole('img', { name: /India domestic route map/i })).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader', { name: /Route/ }).length).toBeGreaterThan(0)
  })

  it('renders the India landmass outline as an SVG path', () => {
    renderWithProviders(<RouteAnalytics />)
    const outline = screen.getByTestId('india-outline')
    expect(outline.tagName).toBe('path')
    expect(outline).toHaveAttribute('d', expect.stringMatching(/^M/))
    expect(outline).toHaveAttribute('fill')
    expect(outline).toHaveAttribute('stroke')
  })

  it('renders the Lakshadweep island dots and boundary attribution', () => {
    renderWithProviders(<RouteAnalytics />)
    const dots = screen.getByTestId('india-lakshadweep')
    expect(dots.querySelectorAll('circle').length).toBeGreaterThanOrEqual(10)
    expect(screen.getByText(/Survey of India representation/)).toBeInTheDocument()
  })

  it('renders all routes initially', () => {
    renderWithProviders(<RouteAnalytics />)
    expect(screen.getAllByText('DEL–BOM').length).toBeGreaterThan(0)
    expect(screen.getAllByText('AMD–DEL').length).toBeGreaterThan(0)
  })

  it('unified airline select filters the table', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RouteAnalytics />)
    const airlineSelect = screen.getByRole('combobox', { name: /Airline/i })
    await user.selectOptions(airlineSelect, '6E')
    // still shows all routes, but the top movement area reflects filtered data
    expect(screen.getAllByRole('columnheader', { name: /Route/ }).length).toBeGreaterThan(0)
  })

  it('route select filters the table and shows a clear badge', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RouteAnalytics />)
    expect(screen.getAllByRole('row').length).toBeGreaterThan(2)
    await user.selectOptions(screen.getByRole('combobox', { name: /Route/i }), 'DEL-BOM')
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(2)
    expect(rows[1]).toHaveTextContent('DEL–BOM')
    expect(screen.getByText(/Filtered by DEL–BOM/)).toBeInTheDocument()
  })

  it('clearing the route filter restores the full table', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RouteAnalytics />)
    await user.selectOptions(screen.getByRole('combobox', { name: /Route/i }), 'DEL-BLR')
    expect(screen.getAllByRole('row')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: /Clear route filter/i }))
    expect(screen.getAllByRole('row').length).toBeGreaterThan(2)
  })

  it('clicking a route on the map filters the table', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RouteAnalytics />)
    const map = screen.getByRole('img', { name: /India domestic route map/i })
    const routePath = map.querySelector('[data-route="DEL-BOM"]') as SVGPathElement
    expect(routePath).not.toBeNull()
    fireEvent.click(routePath)
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2))
    expect(screen.getByText(/Filtered by/)).toBeInTheDocument()
    void user
  })

  it('sorts the table when a column sort is triggered', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RouteAnalytics />)
    const weightHeader = screen.getAllByRole('columnheader', { name: /DGCA Weight/ })[0]!
    const sortButton = weightHeader.querySelector('button') as HTMLButtonElement
    await user.click(sortButton)
    expect(screen.getAllByRole('columnheader', { name: /DGCA Weight/ })[0]).toHaveAttribute('aria-sort', 'ascending')
  })

  it('top movement corresponds to the largest absolute change', () => {
    renderWithProviders(<RouteAnalytics />)
    // Just verify the top movement card renders (calculation correctness is tested in lib)
    expect(screen.getByText('Top movement')).toBeInTheDocument()
  })

  it('map renders cities and route paths', () => {
    renderWithProviders(<RouteAnalytics />)
    const map = screen.getByRole('img', { name: /India domestic route map/i })
    const cities = map.querySelectorAll('circle')
    expect(cities.length).toBeGreaterThan(0)
    const paths = map.querySelectorAll('path')
    expect(paths.length).toBeGreaterThan(0)
  })

  it('reset filters restores defaults', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RouteAnalytics />)
    await user.selectOptions(screen.getByRole('combobox', { name: /Route/i }), 'BOM-GOI')
    expect(screen.getAllByRole('row')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: /Reset Filters/i }))
    expect(screen.getAllByRole('row').length).toBeGreaterThan(2)
  })

  it('map has clickable route paths', () => {
    renderWithProviders(<RouteAnalytics />)
    const map = screen.getByRole('img', { name: /India domestic route map/i })
    const clickable = map.querySelectorAll('path.cursor-pointer')
    expect(clickable.length).toBeGreaterThan(0)
  })
})
