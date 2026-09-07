import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBoundary } from '../ErrorBoundary'
import { PageError } from '../PageError'
import { PageSkeleton } from '../PageSkeleton'
import { ChartSkeleton } from '../ChartSkeleton'
import { ChartErrorBoundary } from '../ChartErrorBoundary'

function Bomb(): never {
  throw new Error('kaboom')
}

function SafeBomb() {
  return <div>I render after reset</div>
}

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary fallback={<div>Fallback</div>}>
        <div>OK</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('OK')).toBeInTheDocument()
  })

  it('renders the fallback when a child throws', () => {
    const onError = vi.fn()
    render(
      <ErrorBoundary fallback={(error, reset) => <PageError error={error} onRetry={reset} />} onError={onError}>
        <Bomb />
      </ErrorBoundary>
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(onError).toHaveBeenCalled()
  })

  it('recovers after retry resets the boundary', async () => {
    let shouldThrow = true
    const user = userEvent.setup()

    function Gate() {
      if (shouldThrow) throw new Error('kaboom')
      return <SafeBomb />
    }

    const { rerender } = render(
      <ErrorBoundary fallback={(error, reset) => <PageError error={error} onRetry={reset} />}>
        <Gate />
      </ErrorBoundary>
    )

    expect(screen.getByRole('alert')).toBeInTheDocument()
    shouldThrow = false
    rerender(
      <ErrorBoundary fallback={(error, reset) => <PageError error={error} onRetry={reset} />}>
        <Gate />
      </ErrorBoundary>
    )
    await user.click(screen.getByRole('button', { name: /Try again/ }))
    expect(screen.getByText('I render after reset')).toBeInTheDocument()
  })
})

describe('PageError', () => {
  it('shows the supplied message and retry action', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    render(<PageError error={new Error('custom message')} onRetry={onRetry} />)
    expect(screen.getByText('custom message')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Try again/ }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('falls back to a generic message when omitted', () => {
    render(<PageError error={null} onRetry={() => {}} />)
    expect(screen.getByText(/unexpected error/i)).toBeInTheDocument()
  })
})

describe('Skeletons', () => {
  it('PageSkeleton announces a loading status', () => {
    render(<PageSkeleton />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading page')
  })

  it('ChartSkeleton announces a loading status', () => {
    render(<ChartSkeleton />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading chart')
  })

  it('ChartSkeleton reports errors when flagged', () => {
    render(<ChartSkeleton error />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Chart failed to load')
    expect(screen.getByText(/unable to display chart/i)).toBeInTheDocument()
  })
})

describe('ChartErrorBoundary', () => {
  it('passes through healthy charts', () => {
    render(<ChartErrorBoundary><div>chart</div></ChartErrorBoundary>)
    expect(screen.getByText('chart')).toBeInTheDocument()
  })

  it('renders a retryable error state when the chart throws', () => {
    const { container } = render(
      <ChartErrorBoundary><Bomb /></ChartErrorBoundary>
    )
    expect(container.querySelector('[aria-label^="Chart failed"]')).not.toBeNull()
    expect(screen.getByText(/unable to display chart/i)).toBeInTheDocument()
  })
})