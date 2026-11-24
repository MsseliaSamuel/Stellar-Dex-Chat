# Transaction locale contract (issue #292)

This document defines how transaction-critical text and numbers are localized.
It complements [locale-timezone-boundaries.md](./locale-timezone-boundaries.md)
and the financial QA fixture conventions in `LOCALE_QA_FIXTURES.md`.

## Boundary

- **Localized:** labels, messages, remediation text, grouping/decimal
  separators, and CLDR plural forms.
- **Never localized:** Soroban numeric codes, HTTP statuses, wallet string
  codes, API reason codes, status identifiers, token/currency codes, and
  canonical amounts in stroops or fiat minor units.

`src/lib/transactionLocale.ts` is display-only. It does not change
`exactAmount.ts`, `stroops.ts`, `payout/minorUnits.ts`, or any persisted value.
The formatter uses `numberingSystem: 'latn'` so displayed digits match the
ASCII-only money parser; Arabic text is localized but the digits stay ASCII.

## Resource layout

All shipped locales (`en`, `fr`, `es`, `ar`) define `transaction.*`:

- `transaction.queue.*` — withdrawal queue labels and plural templates
  (`depth_one`, `depth_other`, plus Arabic `zero`, `two`, `few`, `many`).
- `transaction.amount.*` — stored-amount label and invalid-data fallback.
- `transaction.recovery.*` — recovery panel labels and the legacy diagnostic
  code set (`1001`–`1008`, `USER_DECLINED`, `NETWORK_TIMEOUT`, `RATE_LIMITED`,
  `UNKNOWN_ERROR`).
- `transaction.errors.wallet.*` / `transaction.errors.api.*` — wallet and HTTP
  messages. These live in the transaction namespace so every locale has them.
- `transaction.errors.actions.*` — localized next steps.
- `errors.<numeric-code>` — Soroban messages keyed by the contract code. The
  numeric key is machine-readable; only its value is translated.

Legacy recovery code `1001` means insufficient funds, while current Soroban
code `1001` means below the minimum deposit. They therefore use separate
namespaces; never merge them.

## API

`TranslationContext` exposes:

| Helper                          | Purpose                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `t(key, params?)`               | Resolve a dotted locale key and interpolate every `{param}`. Numeric params use the active locale's number rules. |
| `tp(key, count, params?)`       | Resolve `key_<cldrCategory>` (or `key.<cldrCategory>`), falling back to `other`, then the base key.               |
| `formatNumber(value, options?)` | Locale-aware display formatting for `number`, `bigint`, or canonical numeric strings.                             |

Pure equivalents in `src/lib/transactionLocale.ts` accept an explicit locale:
`resolveTransactionMessage`, `translateTransactionPlural`, `pluralCategory`,
and `formatTransactionNumber`.

`src/lib/localizedErrors.ts` exposes the code-first error API:

| Helper                                                   | Purpose                                                                                                                                             |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `detectTransactionErrorCode(error, { httpStatus? })`     | Return a stable code. Explicit HTTP hints win, then wallet/contract codes, then conservative keyword fallbacks. Translated text is never inspected. |
| `classifyLocalizedError(error, { locale, ... })`         | Keep `code`, `category`, `isRetryable`, `fieldId`, and `safeValues`, but replace message/action with locale resources.                              |
| `messageForTransactionCode` / `actionForTransactionCode` | Resolve Soroban, HTTP, and wallet string codes.                                                                                                     |
| `messageForDiagnosticCode` / `actionForDiagnosticCode`   | Resolve the legacy recovery code namespace.                                                                                                         |
| `localizeDiagnostics(diagnostics, locale)`               | Localize a recovery diagnostic without changing its code, correlation ID, category, retryability, timestamp, or sanitized trace.                    |

Unknown codes resolve to the localized generic message and a safe next step;
no raw diagnostic is interpolated into user-facing text.

## Contributor checklist

1. Add a stable machine code first; then add its message under `errors.<code>`
   or `transaction.errors.<group>.<code>` in **all four** locale files.
2. For counts, add every CLDR category the locale needs. English uses
   `one`/`other`; Arabic also uses `zero`, `two`, `few`, and `many`.
3. Keep codes, status values, `XLM`/`NGN`/`USD`/`USDC`, and typed safety
   phrases verbatim. Localize only the surrounding sentence.
4. Reuse `t`/`tp`/`formatNumber` instead of hard-coded `en-US` formatting or
   manual `s` suffixes.
5. Add focused tests for the normal path and at least one failure,
   authorization, or recovery case. Assert that the machine code is unchanged
   across locales.
6. Never add credentials, real secret keys, or user data to fixtures.

## Related tests

- `src/lib/transactionLocale.test.ts` — plural categories, separators, repeated
  placeholders, resource parity, bigint precision.
- `src/lib/localizedErrors.test.ts` — contract, HTTP, authorization, unknown,
  and recovery cases.
- `src/contexts/TranslationContext.test.tsx` — provider-level `t`, `tp`, and
  `formatNumber`.
- `src/components/__tests__/WithdrawalQueueStatus.test.tsx` — French and Arabic
  queue rendering.
- `src/components/__tests__/TransactionErrorRecovery.test.tsx` — localized
  recovery panel with unchanged machine metadata.
