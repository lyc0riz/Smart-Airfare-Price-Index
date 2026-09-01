import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Select } from '../Select'

describe('Select', () => {
  it('renders a labelled native select', () => {
    render(
      <Select label="Route" aria-label="Route">
        <option>DEL-BOM</option>
      </Select>
    )
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByLabelText('Route')).toBeInTheDocument()
  })

  it('marks the field invalid when an error is present', () => {
    render(
      <Select label="Route" error="Required" aria-label="Route">
        <option>DEL-BOM</option>
      </Select>
    )
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Required')).toBeInTheDocument()
  })

  it('maps an explicitly provided id onto label and control', () => {
    render(
      <Select id="route-select" label="Route">
        <option>BOM-BLR</option>
      </Select>
    )
    expect(screen.getByLabelText('Route')).toHaveAttribute('id', 'route-select')
  })
})