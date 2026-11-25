# WCAG 2.2 AA Accessibility Audit Matrix: Wallet-to-Payout Journey (Issue #90)

## Audit Overview
This document records accessibility verification across connect, review, signing, status tracking, and admin controls against WCAG 2.2 Level AA requirements.

| Route / Component | Criteria Audited | Status | Application Remediation Applied |
| :--- | :--- | :--- | :--- |
| **Freighter Connect Dialog** | Focus trap, Focus return, ESC to dismiss | PASS | Added `useAccessibleModal` trap and restored focus to triggering button on modal close. |
| **Deposit / Review Modal** | Accessible names, ARIA labels, Contrast ratio (>= 4.5:1) | PASS | Labeled numeric inputs, associated error descriptions with `aria-describedby`. |
| **Transaction Confirmation (amount → quote → recipient → wallet sign), Issue #290** | Nested-dialog keyboard trap, polite quote/review announcements, inline error recovery, 320px reflow, contrast | PASS | Added associated labels/hints, a real nested 2FA dialog with suspendable parent trap, focus handoff to `Confirm & Sign`, classified error fallback, and AA-contrast confirm actions. Evidence: [ACCESSIBILITY_TRANSACTION_CONFIRMATION_290.md](ACCESSIBILITY_TRANSACTION_CONFIRMATION_290.md). |
| **Transaction Status Timeline** | Live regions (`aria-live="polite"`), Reflow (320px) | PASS | Added announcements for status transitions (pending -> confirmed). Clean responsive wrapping. |
| **Error Diagnostics Panel** | Keyboard navigation, Expandable disclosure state | PASS | Set `aria-expanded` and interactive button triggers with clear role alert. |
| **Audit Admin Tables** | Screen reader headers, Table row navigation | PASS | Added accessible `<caption>` and `scope="col"` headers with keyboard navigable pagination. |
| **Transaction status UI (progress / warning / failure), Issue #295** | `prefers-reduced-motion`, non-colour status cues, WCAG 2.1 AA contrast in light/dark/forced-colors | PASS | Added `useReducedMotion`, icon + text + colour cues, AA-validated status tokens and forced-colors rules. Evidence: [ACCESSIBILITY_REDUCED_MOTION_CONTRAST.md](ACCESSIBILITY_REDUCED_MOTION_CONTRAST.md). |

## Asynchronous Payout Announcements (Issue #291)

The fiat payout timeline (`TransferTimeline`) exposes exactly one screen-reader
live region. Its messages are defined in
`Dechat/dex_with_fiat_frontend/src/lib/payoutStatusAnnouncements.ts`:

| Lifecycle state | Live-region message | Region |
| :--- | :--- | :--- |
| queued | `Payout queued.` | `role="status"`, `aria-live="polite"` |
| processing | `Payout processing.` | `role="status"`, `aria-live="polite"` |
| settled | `Payout settled.` | `role="status"`, `aria-live="polite"` |
| failed (including reversed/cancelled) | `Payout failed.` | `role="alert"`, `aria-live="assertive"` |
| stale read model | `Payout status is out of date. Refresh before acting.` | `role="status"`, `aria-live="polite"` |

Behavioral contract:

- Repeated polls of the same state never re-announce it; only a distinct
  transition updates the live region.
- Announcements are monotonic. Late or reordered `queued`/`processing` updates
  cannot downgrade a `settled`/`failed` result, and a stale projection cannot
  be presented as confirmed settlement.
- Recovery from a stale projection may resume `processing` or advance to a
  terminal state, but never restarts the announcement sequence at `queued`.
- A new transfer reference starts a fresh, bounded history.
- The visible, ordered status list is explicitly labelled `Payout status
  history`, is outside the live region (`aria-live="off"`), and includes a
  screen-reader-only note that entries can be reviewed at the user's pace. It
  is not rewritten by the announcer.
- Failure detail, when supplied by another caller, is sanitized (secret keys,
  PATs, long account numbers, control characters) and capped in length. The
  timeline itself announces only the five short messages above.

Regression coverage: `src/lib/__tests__/payoutStatusAnnouncements.test.ts`,
`src/hooks/__tests__/usePayoutStatusAnnouncements.test.tsx`, and the `#291`
block in `src/components/__tests__/TransferTimeline.test.tsx`.

## Motion and contrast preferences (Issue #295)

Transaction status surfaces (`TransactionProgressBar`, `TransactionStatusCue`,
`WalletConnectionTimeline`, `TransactionAmountDisplay`) now satisfy:

- `prefers-reduced-motion: reduce` removes spinner/pulse/translate/scale
  animations and smooth scrolling, while the icon + text status cue remains.
- Status is never conveyed by colour alone: each state renders a distinct
  icon, a visible label, and an `sr-only` label for screen readers.
- Every foreground/soft-background token reaches at least 4.5:1 in both light
  and dark themes; `prefers-contrast: more` thickens status borders, and
  forced-colors mode uses `Canvas`/`CanvasText`/`Highlight` so the user's
  high-contrast palette is respected.
- Terminal failure is announced assertively; transient progress and warnings
  politely. Clamping of the displayed percentage cannot desynchronise
  `aria-valuenow` from the visible value.

Full token ratios, boundary cases, and regression test inventory are in
[ACCESSIBILITY_REDUCED_MOTION_CONTRAST.md](ACCESSIBILITY_REDUCED_MOTION_CONTRAST.md).

## Third-Party Wallet Limitations vs Application Defects
- **Extension Popup Focus**: Screen reader behavior inside the native Freighter browser extension popup is controlled by the wallet vendor, not the host DApp.
- **DApp Responsibility**: All modals, form inputs, status announcements, and keyboard shortcuts within the DApp are strictly compliant with WCAG 2.2 AA.
