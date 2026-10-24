/**
 * Spend display currency for the usage ledger.
 *
 * The price book in `./pricing.ts` is DeepSeek's published CNY list, so every
 * `cost` the ledger stores is a CNY amount. This module is the only place that
 * turns such an amount into the text a user reads: CNY passes through
 * unchanged, USD divides by a user-set CNY-per-USD rate. Conversion happens at
 * render time on purpose — the ledger stays unit-stable, so switching the
 * display never rewrites recorded history, and correcting the rate never
 * mutates a stored amount.
 * @module @linxin666/dsh-usage/core/currency
 */

/** Display currencies the spend lines can render. */
export type UsageCurrency = 'CNY' | 'USD'

/** Every currency the settings form offers, in display order. */
export const USAGE_CURRENCIES: readonly UsageCurrency[] = ['CNY', 'USD']

/** Currency the spend lines render until the user picks another one. */
export const DEFAULT_CURRENCY: UsageCurrency = 'CNY'

/**
 * CNY per 1 USD used until the user sets a rate: the 2026-10-23 reference mid
 * rate. It is a shipped constant, never a network lookup, so the spend line
 * keeps rendering offline and inside a deterministic test.
 */
export const DEFAULT_USD_RATE = 6.67

/** Accepted range of the user-set rate; outside it the default applies. */
export const MIN_USD_RATE = 1
export const MAX_USD_RATE = 20

/**
 * The settings surface the spend formatter reads. Values arrive from the
 * Host-generated settings form, so they are unvalidated here on purpose: a
 * profile patch can carry anything, and the formatter falls back rather than
 * throwing inside a render.
 */
export interface SpendDisplay {
  currency?: UsageCurrency | string
  usdRate?: number
}

/** Whether a value is one of {@link USAGE_CURRENCIES}. */
export function isUsageCurrency(value: unknown): value is UsageCurrency {
  return value === 'CNY' || value === 'USD'
}

/** The effective display currency; anything unknown falls back to the default. */
export function resolveCurrency(value: unknown): UsageCurrency {
  return isUsageCurrency(value) ? value : DEFAULT_CURRENCY
}

/** The effective CNY-per-USD rate; a non-finite or out-of-range value falls back to the default. */
export function resolveUsdRate(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_USD_RATE && value <= MAX_USD_RATE
    ? value
    : DEFAULT_USD_RATE
}

/** Symbol prefix of a display currency. */
export function currencySymbol(currency: UsageCurrency): string {
  return currency === 'USD' ? '$' : '¥'
}

/**
 * Convert a stored CNY amount into the display currency.
 * @param costCny - the ledger's fold-time estimate, always CNY.
 * @param display - the settings surface holding the chosen currency and rate.
 * @returns the amount in the display currency.
 */
export function convertSpend(costCny: number, display: SpendDisplay = {}): number {
  return resolveCurrency(display.currency) === 'USD'
    ? costCny / resolveUsdRate(display.usdRate)
    : costCny
}

/**
 * Format a stored CNY amount for display. CNY keeps the ledger's two decimals;
 * USD keeps two above one dollar and four below it, so a light day of usage
 * reads as `$0.4210` instead of collapsing to `$0.00`.
 * @param costCny - the ledger's fold-time estimate, always CNY.
 * @param display - the settings surface holding the chosen currency and rate.
 * @returns the symbol-prefixed text the spend lines render.
 */
export function formatSpend(costCny: number, display: SpendDisplay = {}): string {
  const currency = resolveCurrency(display.currency)
  const amount = currency === 'USD' ? costCny / resolveUsdRate(display.usdRate) : costCny
  // USD keeps four decimals below one dollar; CNY keeps the ledger's two, so
  // the yuan reading never changes with this setting.
  const digits = currency === 'USD' && amount !== 0 && Math.abs(amount) < 1 ? 4 : 2
  return currencySymbol(currency) + amount.toFixed(digits)
}
