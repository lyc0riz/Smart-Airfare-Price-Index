import { describe, it, expect } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { LineChart } from '../LineChart'
import { BarChart } from '../BarChart'

const data = [
  { date: '2026-08-01', index: 100, second: 50 },
  { date: '2026-08-02', index: 102, second: 52 },
]

describe('LineChart', () => {
  it('renders chart wrapper with the expected series count', async () => {
    const { container } = render(<LineChart data={data} xKey="date" yKeys={['index', 'second']} />)
    await waitFor(() => expect(container.querySelector('.recharts-wrapper')).not.toBeNull())
    expect(container.querySelectorAll('.recharts-line')).toHaveLength(2)
  })

  it('renders a reference line when requested', async () => {
    const { container } = render(
      <LineChart data={data} xKey="date" yKeys={['index']} showReferenceLine={{ y: 100, label: 'Base' }} />
    )
    await waitFor(() => expect(container.querySelector('.recharts-reference-line')).not.toBeNull())
  })

  it('supports custom formatters without crashing', async () => {
    const { container } = render(
      <LineChart data={data} xKey="date" yKeys={['index']} xFormatter={(v) => `D:${v}`} yFormatter={(v) => `${v}x`} />
    )
    await waitFor(() => expect(container.querySelector('.recharts-wrapper')).not.toBeNull())
  })
})

describe('BarChart', () => {
  it('renders bars for the requested keys', async () => {
    const { container } = render(<BarChart data={data} xKey="date" yKeys={['index']} />)
    await waitFor(() => expect(container.querySelector('.recharts-wrapper')).not.toBeNull())
    expect(container.querySelectorAll('.recharts-rectangle').length).toBeGreaterThan(0)
  })

  it('renders stacked bars when configured', async () => {
    const { container } = render(<BarChart data={data} xKey="date" yKeys={['index', 'second']} stacked />)
    await waitFor(() => expect(container.querySelector('.recharts-wrapper')).not.toBeNull())
  })
})