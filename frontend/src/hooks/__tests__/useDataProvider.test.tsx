import { ReactNode } from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { useDataProvider, ModeProvider } from '../useDataProvider'
import { createTestQueryClient } from '../../test/utils'

function ProviderWrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter>
        <ModeProvider>{children}</ModeProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('useDataProvider', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('throws when used outside a provider', () => {
    expect(() => renderHook(() => useDataProvider())).toThrow('useDataProvider must be used within a ModeProvider')
  })

  it('defaults to prototype mode', () => {
    const { result } = renderHook(() => useDataProvider(), { wrapper: ProviderWrapper })
    expect(result.current.mode).toBe('prototype')
    expect(result.current.provider).toBeTruthy()
  })

  it('switches between modes', () => {
    const { result } = renderHook(() => useDataProvider(), { wrapper: ProviderWrapper })
    act(() => result.current.setMode('build'))
    expect(result.current.mode).toBe('build')
    act(() => result.current.setMode('prototype'))
    expect(result.current.mode).toBe('prototype')
  })

  it('persists mode to localStorage', async () => {
    const { result } = renderHook(() => useDataProvider(), { wrapper: ProviderWrapper })
    act(() => result.current.setMode('build'))
    await waitFor(() => expect(localStorage.getItem('apix_mode')).toBe('build'))
  })

  it('reads persisted mode on mount', () => {
    localStorage.setItem('apix_mode', 'build')
    const { result } = renderHook(() => useDataProvider(), { wrapper: ProviderWrapper })
    expect(result.current.mode).toBe('build')
  })

  it('provides different providers per mode', () => {
    const { result } = renderHook(() => useDataProvider(), { wrapper: ProviderWrapper })
    const proto = result.current.provider
    act(() => result.current.setMode('build'))
    expect(result.current.provider).not.toBe(proto)
  })
})