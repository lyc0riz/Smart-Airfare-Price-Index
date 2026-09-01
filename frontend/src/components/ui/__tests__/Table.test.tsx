import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Table } from '../Table'

interface Row {
  id: string
  name: string
  value: number
}

const rows: Row[] = [
  { id: 'a', name: 'Alpha', value: 10 },
  { id: 'b', name: 'Beta', value: 5 },
]

const cols = [
  { key: 'name', header: 'Name', accessor: (r: Row) => r.name, sortable: true },
  { key: 'value', header: 'Value', accessor: (r: Row) => r.value, align: 'right' as const },
]

describe('Table', () => {
  it('renders headers and row cells', () => {
    render(
      <Table
        columns={cols}
        data={rows}
        keyExtractor={(r) => r.id}
      />
    )
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('calls onSort with toggled direction when a sortable header button is clicked', async () => {
    const onSort = vi.fn()
    const user = userEvent.setup()
    render(<Table columns={cols} data={rows} keyExtractor={(r) => r.id} onSort={onSort} sortKey="name" sortDirection="asc" />)
    await user.click(screen.getByRole('button', { name: /Name/ }))
    expect(onSort).toHaveBeenCalledWith('name', 'desc')
  })

  it('marks the active sort column via aria-sort', () => {
    render(<Table columns={cols} data={rows} keyExtractor={(r) => r.id} sortKey="name" sortDirection="desc" />)
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'descending')
    expect(screen.getByRole('columnheader', { name: /Value/ })).not.toHaveAttribute('aria-sort')
  })

  it('renders the empty message when there is no data', () => {
    render(<Table columns={cols} data={[]} keyExtractor={(r) => r.id} emptyMessage="Nothing here" />)
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })

  it('renders a table element with row scopes', () => {
    render(<Table columns={cols} data={rows} keyExtractor={(r) => r.id} />)
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')).toHaveLength(2)
    expect(screen.getAllByRole('row')).toHaveLength(3)
  })
})