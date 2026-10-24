/** @vitest-environment node */

/**
 * The spend display currency: the ledger stores CNY (the price book's unit), so
 * this module is the only place that turns a stored amount into rendered text.
 * These specs pin the CNY passthrough, the USD conversion at the configured
 * rate, the fallbacks for values a profile patch can carry, and the USD
 * precision rule that keeps a light day from reading as zero.
 */

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_USD_RATE,
  convertSpend,
  formatSpend,
  isUsageCurrency,
  resolveCurrency,
  resolveUsdRate,
} from '../src/core/currency.ts'

describe('spend display currency', () => {
  it('user sees the ledger amount as CNY until another currency is chosen', () => {
    // Given a stored CNY amount and no display preference
    const stored = 31.444756

    // When the amount is formatted
    // Then it keeps the ledger's two decimals behind the yuan symbol
    expect(formatSpend(stored)).toBe('¥31.44')
    expect(formatSpend(stored, {})).toBe('¥31.44')
    expect(formatSpend(0)).toBe('¥0.00')
  })

  it('user sees the amount converted at the chosen rate when USD is selected', () => {
    // Given the USD display at the default reference rate
    const display = { currency: 'USD', usdRate: DEFAULT_USD_RATE } as const

    // When the same stored amounts are formatted
    // Then each is divided by the rate and prefixed with the dollar sign
    expect(formatSpend(31.444756, display)).toBe('$4.71')
    expect(formatSpend(6.67, display)).toBe('$1.00')
    expect(formatSpend(0, display)).toBe('$0.00')
  })

  it('user sees four decimals for a USD amount under one dollar', () => {
    // Given a light day whose CNY total is a few cents once converted
    const display = { currency: 'USD', usdRate: 6.67 } as const

    // When that amount is formatted
    // Then it keeps four decimals instead of collapsing to $0.00
    expect(formatSpend(0.5, display)).toBe('$0.0750')
    expect(formatSpend(1, { currency: 'USD', usdRate: 1 })).toBe('$1.00')
  })

  it('user sees the CNY amount when the rate setting is unusable', () => {
    // Given a USD preference whose rate sits outside the accepted range
    // When the amount is converted
    // Then the default rate applies instead of an infinite or negative amount
    expect(convertSpend(6.67, { currency: 'USD', usdRate: 0 })).toBeCloseTo(1, 6)
    expect(convertSpend(6.67, { currency: 'USD', usdRate: 100 })).toBeCloseTo(1, 6)
    expect(convertSpend(6.67, { currency: 'USD', usdRate: Number.NaN })).toBeCloseTo(1, 6)
  })

  it('user sees the ledger amount unchanged when the currency is not offered', () => {
    // Given a stored setting naming a currency the plugin does not render
    // When the currency is resolved
    // Then the default CNY sticks and the CNY amount passes through untouched
    expect(resolveCurrency('EUR')).toBe('CNY')
    expect(resolveCurrency(undefined)).toBe('CNY')
    expect(convertSpend(31.44, { currency: 'EUR' })).toBe(31.44)
    expect(formatSpend(31.44, { currency: 'EUR' })).toBe('¥31.44')
  })

  it('operator can rely on the accepted set and rate range', () => {
    // Given the exported settings contract
    // When the membership and range helpers run
    // Then only the rendered currencies pass and out-of-range rates fall back
    expect(isUsageCurrency('CNY')).toBe(true)
    expect(isUsageCurrency('USD')).toBe(true)
    expect(isUsageCurrency('usd')).toBe(false)
    expect(resolveUsdRate(7.2)).toBe(7.2)
    expect(resolveUsdRate(0.5)).toBe(DEFAULT_USD_RATE)
    expect(resolveUsdRate('7.2')).toBe(DEFAULT_USD_RATE)
  })
})
