import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import type { DataProvider } from '../lib/data-provider'
import { prototypeProvider } from '../lib/prototype/provider'
import { buildProvider } from '../lib/build/provider'

type Mode = 'prototype' | 'build'

interface ModeContextType {
  mode: Mode
  setMode: (mode: Mode) => void
  provider: DataProvider
}

const ModeContext = createContext<ModeContextType | null>(null)

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('apix_mode') as Mode) || 'prototype'
    }
    return 'prototype'
  })

  const provider = mode === 'prototype' ? prototypeProvider : buildProvider

  useEffect(() => {
    localStorage.setItem('apix_mode', mode)
  }, [mode])

  return (
    <ModeContext.Provider value={{ mode, setMode, provider }}>
      {children}
    </ModeContext.Provider>
  )
}

export function useDataProvider() {
  const context = useContext(ModeContext)
  if (!context) {
    throw new Error('useDataProvider must be used within a ModeProvider')
  }
  return context
}