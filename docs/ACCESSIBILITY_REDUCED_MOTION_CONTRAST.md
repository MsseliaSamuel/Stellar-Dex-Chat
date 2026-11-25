# Reduced motion and high contrast for transaction status (issue #295)

This document records the display-layer changes that make transaction status
understandable without animation and with sufficient contrast in light, dark,
and high-contrast (forced-colors) modes.

## Scope and safety

- Applies to the status surfaces in `Dechat/dex_with_fiat_frontend`:
  `TransactionProgressBar`, `TransactionStatusCue`,
  `WalletConnectionTimeline`, `TransactionAmountDisplay`, and the failure
  `ErrorSummary`. Other animated status surfaces inherit the global CSS
  reduced-motion backstop described below.
- **No financial behaviour changes.** BigInt stroops, minor-unit conversion,
  quote expiry, payout state transitions, and retry/idempotency logic are not
  touched. `TransactionProgressBar` only clamps the *reported* percentage used
  for `aria-valuenow` and the CSS fill width; it does not change any amount or
  transaction state.
- All fixtures in the tests are synthetic; no credentials or real user data are
  added.

## Non-animated status cues

Every status surface conveys state through three independent channels:

| Channel | Implementation |
| :--- | :--- |
| Shape | A distinct lucide icon: spinner (progress), check (success), warning triangle (warning), cross (failure). |
| Text | A visible label plus an `sr-only` `Status: …` label. Screen readers always receive the label. |
| Colour | A dedicated token with a validated WCAG 2.1 AA contrast ratio. |

The icon and text are rendered regardless of the `prefers-reduced-motion`
setting. Only the optional progress spinner and CSS transitions are suppressed.
`WalletConnectionTimeline` also emits an `sr-only` status word (`completed`,
`in progress`, `not started`, `needs attention`) for each step because its dots
are otherwise colour-only.

## Motion behaviour

| Source | Normal | `prefers-reduced-motion: reduce` |
| :--- | :--- | :--- |
| Progress spinner | `animate-spin` | Removed; icon shape + label remain |
| Timeline active dot | `animate-pulse` | Removed; checked/dot border remains |
| Progress fill width | 300 ms transition | No transition |
| Amount display (`framer-motion`) | translate + scale + fade | Fade only, 0.01 s, no delay |
| Auto-scroll to latest amount | `scrollIntoView({ behavior: 'smooth' })` | `behavior: 'auto'` |
| Failure summary auto-scroll (`ErrorSummary`) | Smooth scroll to `role="alert"` | `behavior: 'auto'` |
| CSS keyframes (`fadeIn`, `pulse`, `float`, …) | Enabled | Neutralised by a global `@media (prefers-reduced-motion: reduce)` block |

`useReducedMotion()` wraps the existing `useMediaQuery` hook and subscribes to
runtime changes, so toggling the OS setting while the app is open updates every
surface without a reload.

## Validated contrast

Tokens are declared once in `src/lib/statusContrast.ts` and mirrored by CSS
custom properties in `src/app/globals.css`. A test reads the CSS file and
asserts the two copies stay in sync. Ratios are computed with the WCAG relative
luminance formula (minimum **4.5:1** for text, **3:1** for non-text).

| Status | Light foreground / soft background | Ratio | Dark foreground / soft background | Ratio |
| :--- | :--- | :---: | :--- | :---: |
| Progress | `#1d4ed8` / `#eff6ff` | 6.16:1 | `#93c5fd` / `#11233f` | 8.72:1 |
| Success | `#15803d` / `#f0fdf4` | 4.79:1 | `#86efac` / `#052e16` | 10.62:1 |
| Warning | `#92400e` / `#fffbeb` | 6.84:1 | `#fcd34d` / `#451a03` | 10.39:1 |
| Failure | `#991b1b` / `#fef2f2` | 7.60:1 | `#fca5a5` / `#450a0a` | 8.51:1 |

Every foreground also clears 4.5:1 against the surrounding theme surface
(`#ffffff` light / `#0f172a` dark). The pre-existing `--color-success`
(`#16a34a`) and `--color-warning` (`#d97706`) tokens remain unchanged because
they are used as soft fills; they are deliberately **not** used as status text
colours, since `#d97706` on white is only ~2.6:1.

### High-contrast / forced-colors mode

For users who request more contrast without a full system palette
(`prefers-contrast: more`), status surfaces gain thicker borders; the validated
colour tokens are unchanged.

In `@media (forced-colors: active)` status surfaces use the browser-provided
system colours (`Canvas`, `CanvasText`, `Highlight`) rather than hard-coded
hex values, so the user's chosen high-contrast palette is preserved. Borders
are added to cues and the progress bar, and the progress fill uses `Highlight`
with `forced-color-adjust: none` so it stays visible. The icon and text remain
the primary status signals.

## Boundary and failure cases

- `progressPercent` of `-25` → `0`, `250` → `100`, `NaN`/infinity → `0`;
  `aria-valuenow` and the rendered percentage always agree.
- Invalid `TransactionAmountDisplay` props still render a readable error
  message under reduced motion (no hidden text).
- A terminal failure uses `role="alert"` / `aria-live="assertive"`; transient
  progress and warnings use `role="status"` / `aria-live="polite"`.
- A wallet disconnect during an active transfer keeps the assertive alert and
  the "needs attention" cue without relying on the pulsing dot.

## Regression coverage

| File | Covers |
| :--- | :--- |
| `src/lib/statusContrast.test.ts` | WCAG math, all light/dark pairs, forced-colors system tokens, CSS/TS parity, motion and forced-colors CSS blocks |
| `src/hooks/__tests__/useReducedMotion.test.ts` | Initial state, reduced preference, runtime change, canonical query |
| `src/components/__tests__/TransactionStatusCue.test.tsx` | Icon + text for all four states, sr-only label, spinner gating |
| `src/components/__tests__/TransactionProgressBar.test.tsx` | Step mapping, clamping, live regions, retry/cancel, reduced-motion gating |
| `src/components/__tests__/WalletConnectionTimeline.test.tsx` | Pulse gating, text status, mid-transfer disconnect alert |
| `src/components/__tests__/TransactionAmountDisplay.reducedMotion.test.tsx` | Instant scroll, readable error text |
| `src/components/__tests__/ErrorSummary.reducedMotion.test.tsx` | Instant scroll to an assertive failure summary |

Run the focused suite from `Dechat/dex_with_fiat_frontend`:

```bash
pnpm exec vitest run src/lib/statusContrast.test.ts \
  src/hooks/__tests__/useReducedMotion.test.ts \
  src/components/__tests__/TransactionStatusCue.test.tsx \
  src/components/__tests__/TransactionProgressBar.test.tsx \
  src/components/__tests__/WalletConnectionTimeline.test.tsx \
  src/components/__tests__/TransactionAmountDisplay.reducedMotion.test.tsx
```
