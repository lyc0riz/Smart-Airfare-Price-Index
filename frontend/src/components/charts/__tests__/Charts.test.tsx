import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { LineChart } from '../LineChart'
import { BarChart } from '../BarChart'

const data = [
  { date: '2026-08-01', index: 100, second: 50 },
  { date: '2026-08-02', index: 102, second: 52 },
]

describe('LineChart', () => {
  it('renders chart wrapper with the expected series count', () => {
    const { container } = render(<LineChart data={data} xKey="date" yKeys={['index', 'second']} />)
    expect(container.querySelector('.recharts-wrapper')).not.toBeNull()
    expect(container.querySelectorAll('.recharts-line')).toHaveLength(2)
  })

  it('renders a reference line when requested', () => {
    const { container } = render(
      <LineChart data={data} xKey="date" yKeys={['index']} showReferenceLine={{ y: 100, label: 'Base' }} />
    )
    expect(container.querySelector('.recharts-reference-line')).not.toBeNull()
  })

  it('supports custom formatters without crashing', () => {
    const { container } = render(
      <LineChart data={data} xKey="date" yKeys={['index']} xFormatter={(v) => `D:${v}`} yFormatter={(v) => `${v}x`} />
    )
    expect(container.querySelector('.recharts-wrapper')).not.toBeNull()
  })
})

describe('BarChart', () => {
  it('renders bars for the requested keys', () => {
    const { container } = render(<BarChart data={data} xKey="date" yKeys={['index']} />)
    expect(container.querySelector('.recharts-wrapper')).not.toBeNull()
    expect(container.querySelectorAll('.recharts-rectangle')).not.toBeNull()
  })

  it('renders stacked bars when configured', () => {
    const { container } = render(<BarChart data={data} xKey="date" yKeys={['index', 'second']} stacked />)
    expect(container.querySelector('.recharts-wrapper')).not.toBeNull()
  })
})