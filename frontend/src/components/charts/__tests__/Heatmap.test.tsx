import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Heatmap } from '../Heatmap'

const cells = [
  { route: 'DEL-BOM', window: 1, value: 100 },
  { route: 'DEL-BOM', window: 7, value: 120 },
  { route: 'DEL-BLR', window: 1, value: 90 },
]

describe('Heatmap', () => {
  it('labels cells for assistive technologies', () => {
    render(<Heatmap data={cells} routes={['DEL-BOM', 'DEL-BLR']} windows={[1, 7]} />)
    expect(screen.getByRole('gridcell', { name: /DEL-BOM T\+1/ })).toBeInTheDocument()
    expect(screen.getByText('T+1')).toBeInTheDocument()
  })

  it('invokes onCellClick from the keyboard', async () => {
    const onCellClick = vi.fn()
    const user = userEvent.setup()
    render(<Heatmap data={cells} routes={['DEL-BOM']} windows={[1]} onCellClick={onCellClick} />)
    const cell = screen.getByRole('gridcell', { name: /DEL-BOM T\+1/ })
    cell.focus()
    await user.keyboard('{Enter}')
    expect(onCellClick).toHaveBeenCalledWith(cells[0])
  })

  it('renders empty cells as transparent placeholders', () => {
    render(<Heatmap data={[cells[0]!]} routes={['DEL-BLR']} windows={[7]} />)
    const cell = screen.getByRole('gridcell', { name: /DEL-BLR T\+7/ })
    expect(cell.textContent).toBe('')
  })
})