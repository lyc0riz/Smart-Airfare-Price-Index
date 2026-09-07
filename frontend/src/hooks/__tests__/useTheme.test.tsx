import { ReactNode } from 'react'
import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTheme, ThemeProvider } from '../useTheme'

function ProviderWrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>
}

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('throws when used outside a provider', () => {
    expect(() => renderHook(() => useTheme())).toThrow('useTheme must be used within a ThemeProvider')
  })

  it('defaults to light theme', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ProviderWrapper })
    expect(result.current.theme).toBe('light')
  })

  it('toggles theme and applies the dark class', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ProviderWrapper })
    act(() => result.current.toggleTheme())
    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('persists theme to localStorage', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ProviderWrapper })
    act(() => result.current.toggleTheme())
    expect(localStorage.getItem('apix_theme')).toBe('dark')
  })

  it('reads persisted theme on mount', () => {
    localStorage.setItem('apix_theme', 'dark')
    const { result } = renderHook(() => useTheme(), { wrapper: ProviderWrapper })
    expect(result.current.theme).toBe('dark')
  })
})