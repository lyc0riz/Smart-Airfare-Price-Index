import { describe, it, expect } from 'vitest'
import { cn, formatINR, formatNumber, formatPct, formatDate, formatMonth, pct, inr } from '../utils'

describe('cn', () => {
  it('merges tailwind classes with clsx + tailwind-merge', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
    expect(cn('a', 'c', undefined)).toBe('a c')
    expect(cn([], ['x'])).toBe('x')
  })

  it('handles falsy inputs', () => {
    expect(cn(undefined, null, '')).toBe('')
    expect(cn('foo')).toBe('foo')
  })
})

describe('formatINR', () => {
  it('formats values in the Indian numbering system', () => {
    expect(formatINR(1234567)).toBe('₹12,34,567')
    expect(formatINR(0)).toBe('₹0')
  })

  it('rounds to whole rupees', () => {
    expect(formatINR(5240.75)).toBe('₹5,241')
  })
})

describe('formatNumber', () => {
  it('formats with Indian grouping', () => {
    expect(formatNumber(1234567)).toBe('12,34,567')
    expect(formatNumber(400)).toBe('400')
  })
})

describe('formatPct', () => {
  it('adds a leading plus for positive values', () => {
    expect(formatPct(3.45)).toBe('+3.5%')
  })

  it('keeps negatives without plus and honours custom digits', () => {
    expect(formatPct(-2.1, 2)).toBe('-2.10%')
  })
})

describe('formatDate / formatMonth', () => {
  it('formats an ISO date with day, month and year', () => {
    const out = formatDate('2026-08-31')
    expect(out).toContain('31')
    expect(out).toContain('Aug')
    expect(out).toContain('2026')
  })

  it('formats a month alone', () => {
    const out = formatMonth('2026-08')
    expect(out).toContain('Aug')
    expect(out).toContain('2026')
  })
})

describe('pct', () => {
  it('formats with sign and custom digits', () => {
    expect(pct(1.24)).toBe('+1.2%')
    expect(pct(-0.5, 0)).toBe('-1%')
  })
})

describe('inr', () => {
  it('formats a compact rupee string', () => {
    expect(inr(5240)).toBe('₹5,240')
    expect(inr(99.6)).toBe('₹100')
  })
})