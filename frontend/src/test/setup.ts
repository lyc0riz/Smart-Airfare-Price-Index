import '@testing-library/jest-dom/vitest'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { cleanup } from '@testing-library/react'
import { server } from '../mocks/server'
import { clearApiCache } from '../lib/build/provider'

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
  localStorage.clear()
  clearApiCache()
})

afterAll(() => {
  server.close()
})

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

window.ResizeObserver = window.ResizeObserver || (ResizeObserverMock as unknown as typeof ResizeObserver)

class IntersectionObserverMock {
  root = null
  rootMargin = ''
  thresholds = []
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

window.IntersectionObserver = window.IntersectionObserver || (IntersectionObserverMock as unknown as typeof IntersectionObserver)

window.scrollTo = window.scrollTo || (() => {})

const rect = () => ({
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  top: 0,
  left: 0,
  bottom: 100,
  right: 100,
  toJSON: () => ({}),
})

Object.defineProperty(window.HTMLElement.prototype, 'getClientRects', {
  configurable: true,
  value: () => [rect()],
})

Object.defineProperty(window.HTMLElement.prototype, 'getBoundingClientRect', {
  configurable: true,
  value: rect,
})

globalThis.structuredClone = globalThis.structuredClone || ((value: unknown) => JSON.parse(JSON.stringify(value)))