# Agent Note: Spend display currency on a CNY ledger

Status: implemented

## Problem

`dsh-usage` prices the official DeepSeek family from the published CNY price book (`src/core/pricing.ts`), so every `cost` folded into the ledger is a CNY amount, and every spend surface rendered that amount with a hardcoded `¥`: the sidebar foot card headline, the usage tab's day and provider rows, and the Token bank's observed and estimated spend lines.

Two problems followed. An account whose provider bills in another currency reads two units in one card, because the balance row renders whatever its endpoint returns: an international DeepSeek account answers `{"currency":"USD","totalBalance":"5.67"}`, so the card showed `¥31.44` of spend beside a `$5.67` balance, and comparing them meant converting by hand. And the plugin offered no way to display another currency at all — the Config schema carried `enabled`, `pollIntervalSec` and `retainDays` only.

## Decision

- **The ledger stays CNY.** `cost` keeps the price book's unit, so no migration, re-fold or settings write touches a recorded day. Switching the display currency, or correcting the rate, is a pure render-time conversion.
- **One conversion home.** New `src/core/currency.ts` owns the setting vocabulary and the formatting: `UsageCurrency = 'CNY' | 'USD'`, `USAGE_CURRENCIES`, `DEFAULT_CURRENCY = 'CNY'`, `DEFAULT_USD_RATE = 6.67` (the 2026-10-23 reference mid rate), the accepted `1`-`20` rate range, `resolveCurrency` / `resolveUsdRate` fallbacks, `convertSpend` and `formatSpend(costCny, display)`. Both programs compile `src/core/`, so the foot card, the section and any later surface format through one function instead of repeating a symbol.
- **Two Config fields, client-read.** `currency: z.union([...USAGE_CURRENCIES]).default('CNY').volatile()` and `usdRate: z.number().min(1).max(20).default(6.67).volatile()`, each with a description the Host-rendered settings page shows. The Host half accepts and ignores them; the client half is their only reader, because it decides how a stored amount renders. The section's own settings row adds a currency select and a rate input beside the existing controls, so the choice is reachable from the card as well as the Host page.
- **Precision per currency.** CNY keeps the ledger's two decimals, exactly as before. USD keeps two decimals above one dollar and four below it: without that rule a light day's few cents round to `$0.00`, which is not hypothetical — 1,679 calls cost about $4.71 on the reporting account, so a tenth of that day reads as zero under uniform `toFixed(2)`.
- **Balances are not converted.** `formatBalance` keeps rendering the currency its endpoint reports (`CNY` for a mainland Moonshot account, `USD` for an international one) and falls back to the ISO code otherwise. The setting describes the spend estimate only.
- **Locale keys.** `usage.config.currency` and `usage.config.usdRate` join the zh dictionary (the key source), the en mirror and the central ru pack. `usage.bank.spend.observed` / `usage.bank.spend.estimated` drop their literal `¥` and receive the already formatted amount in `{cost}`, so the symbol follows the setting in every language rather than being restated by each translation.

## Alternatives considered

- **Follow the provider's balance currency automatically** (`currency: 'follow'` as the only mode). It needs no rate setting and would be right for the reporting account, but a provider with no balance endpoint — a relay route or a subscription plan — leaves no currency to follow, and the user cannot choose a currency the endpoint disagrees with. The manual selector covers both; `follow` could still arrive later as a third option.
- **Convert at fold time and store the displayed amount.** Rejected for the same reason the price book is a shipped snapshot: a stored displayed amount bakes one rate into history, so a later rate correction either cannot be applied or silently rewrites days the user already read.
- **Fetch the exchange rate at runtime.** Rejected: it adds an outbound network dependency and unbounded failure modes to a local render path, and [the price-book note](../bug-fix/2026-09-10-deepseek-v41-flash-price-book.md) already declined a runtime price-table fetch on the same grounds. A manual rate with a shipped default keeps the spend line offline and deterministic in tests.
- **Keep the hardcoded `¥` and document the conversion.** Rejected: the mixture is exactly what the report named, and a README paragraph does not answer "how much of my balance did today cost" in the card that exists to answer it.
- **Uniform two decimals in both currencies.** Rejected: simple, but it rounds every sub-dollar USD day to `$0.00` and makes the headline look broken precisely for the light usage a user checks most often.

## Consequences

- A user who sets USD sees one converted number everywhere the spend estimate appears; balance rows keep their own units and the card no longer mixes an unconverted estimate with a reported balance.
- The rate is manual and never refreshed by the plugin, so an unmaintained rate drifts from the market one; the known-limitations section of the README states that.
- `currency` and `usdRate` are live (`volatile()`) settings, so a change repaints the card and the section without reloading the plugin row.
- The stored ledger format is unchanged: no version bump, and a downgrade to 0.4.8 keeps reading every file this build writes.

## Testing

`packages/dsh-usage/tests/currency.spec.ts` pins the CNY passthrough (`¥31.44` from `31.444756`), the USD conversion at the configured rate (`$4.71` for the same amount at `6.67`), the four-decimal rule below one dollar (`$0.0750`), the fallbacks for an unknown currency and an out-of-range or non-numeric rate, and the accepted range helpers. `foot-card.spec.tsx` renders the card under a USD form and asserts both the converted headline and the untouched CNY balance line; `section-card.spec.tsx` renders the Token bank's spend line in USD and drives the new settings controls, asserting the exact form writes. The package suite (196 tests), `pnpm typecheck`, `pnpm test:standards`, `pnpm docs:check`, `pnpm i18n:check` and `pnpm libs:check` are green; the aggregate's source fingerprint in `scripts/lib-artifact-fingerprints.json` was re-recorded after `pnpm build`.
