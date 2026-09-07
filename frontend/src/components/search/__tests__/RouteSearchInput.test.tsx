import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RouteSearchInput } from '../RouteSearchInput'

describe('RouteSearchInput', () => {
  it('renders input with placeholder', () => {
    render(<RouteSearchInput value="" onChange={() => {}} placeholder="Search test" />)
    expect(screen.getByPlaceholderText('Search test')).toBeInTheDocument()
  })

  it('calls onChange when user types', () => {
    const handleChange = vi.fn()
    render(<RouteSearchInput value="" onChange={handleChange} />)
    const input = screen.getByRole('textbox', { name: /search routes/i })
    fireEvent.change(input, { target: { value: 'DEL' } })
    expect(handleChange).toHaveBeenCalledWith('DEL')
  })

  it('renders clear button when value is present and clears on click', () => {
    const handleChange = vi.fn()
    render(<RouteSearchInput value="DEL" onChange={handleChange} />)
    const clearButton = screen.getByRole('button', { name: /clear search/i })
    expect(clearButton).toBeInTheDocument()
    fireEvent.click(clearButton)
    expect(handleChange).toHaveBeenCalledWith('')
  })
})
