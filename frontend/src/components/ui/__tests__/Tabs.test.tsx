import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tabs } from '../Tabs'

const tabs = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
]

describe('Tabs', () => {
  it('marks the active tab as selected', () => {
    render(<Tabs tabs={tabs} activeKey="weekly" onChange={() => {}} />)
    expect(screen.getByRole('tab', { name: 'Weekly' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Daily' })).toHaveAttribute('aria-selected', 'false')
  })

  it('switches the selected tab on click', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Tabs tabs={tabs} activeKey="daily" onChange={onChange} />)
    await user.click(screen.getByRole('tab', { name: 'Weekly' }))
    expect(onChange).toHaveBeenCalledWith('weekly')
  })

  it('moves focus with arrow keys and triggers onChange', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Tabs tabs={tabs} activeKey="daily" onChange={onChange} />)
    const daily = screen.getByRole('tab', { name: 'Daily' })
    daily.focus()
    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenCalledWith('weekly')
    expect(screen.getByRole('tab', { name: 'Weekly' })).toHaveFocus()
  })

  it('applies roving tabindex so only the active tab is tabbable', () => {
    render(<Tabs tabs={tabs} activeKey="weekly" onChange={() => {}} />)
    expect(screen.getByRole('tab', { name: 'Weekly' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Daily' })).toHaveAttribute('tabindex', '-1')
  })
})