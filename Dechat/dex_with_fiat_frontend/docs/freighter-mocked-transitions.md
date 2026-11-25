# Freighter-Mocked Transitions (#273)

## Coverage

- **Account/network switch during signing**: `StellarWalletContext.signTx` validates live Freighter address/network against expected context and throws `WALLET_CONTEXT_CHANGED` before signing/submitting writes.
- **Wrong-network write block**: signing rejects when passphrase is not Stellar Testnet / expected context.
- **Account-scoped UI state clearing**: disconnect and account selection clear generic pending tx markers and account-scoped pending tx keys for the previous account; context version increments on account switch.

## Least-Privilege Permissions (#195)

- **Read-only vs. signing**: connecting only requests account access (`requestAccess` / `getAddress`). Transaction signing (`signTransaction`) is requested per action, at the moment a write is submitted — never bundled into connect.
- **Prompt explanation**: each permission prompt is explained in the UI at the point of request so the user knows whether they are granting read-only account access or authorizing a specific transaction signature.
- **Denial handling**: denying account access or a signing request leaves no partially authenticated session — the wallet stays disconnected (or the pending action is aborted) with a recoverable UI state and no stale connected markers.
- **Compatibility note**: this is an intentional behavior change from a blanket connect+sign flow; callers must request signing only when a write is actually submitted.

## Pre-Submit Revalidation (#196)

- **Re-check after confirmation**: immediately before submitting a signed XDR, the submission path re-reads the live wallet address, the network passphrase, and the configured contract identity, and compares them against the values captured when the user confirmed the action.
- **Fail closed on drift**: if any of the three values changed between confirmation and submission, submission is aborted before the XDR is sent. No transaction is broadcast and no pending-tx marker is left behind.
- **Recoverable message**: the abort surfaces a user-facing, recoverable message (e.g. wallet account or network changed — please review and retry) rather than a silent failure or a generic error.
- **Safety preserved**: double-submit protection and audit logging are unchanged; the revalidation runs inside the existing guarded submission path so a drifted context cannot bypass the single-submit lock.

## Transaction Recovery State Machine (#197)

- **Explicit typed states**: a transaction is modeled as one of `built`, `signed`, `submitted`, `pending`, `confirmed`, `failed`, `expired`. The state is a discriminated union so each state carries only the data valid for it.
- **Minimal persisted recovery data**: only the fields needed to resume or recover a transaction are persisted — the transaction hash (once known), the signed XDR (until confirmed/failed/expired), the account address, the network passphrase, the contract identity, and a timestamp. No secrets, keys, or unrelated UI state are stored.
- **Allowed transitions**: `built → signed → submitted → pending → confirmed | failed | expired`. `submitted → failed` and `pending → failed | expired` are permitted; terminal states (`confirmed`, `failed`, `expired`) have no outgoing transitions.
- **Impossible transitions are detectable**: transitions are guarded by a typed transition function that throws a typed `INVALID_TRANSITION` error (carrying `from`/`to`) instead of silently mutating state, so illegal moves surface in tests and at runtime.
- **Recovery on reload**: persisted state is rehydrated into the typed machine; a transaction left in `submitted`/`pending` past its expiry window is moved to `expired` rather than being re-broadcast, preserving single-submit safety.

## Expired Transaction Recovery (#198)

- **Authoritative refresh before rebuild**: when a transaction is `expired`, recovery first fetches the authoritative account sequence number and the operation status from the network before rebuilding. The rebuild never reuses a stale sequence or assumes the prior operation did not land.
- **Idempotency keys preserved**: the existing idempotency key is carried across the rebuild unchanged, so a retry of the same logical operation cannot produce a duplicate payout even if the original transaction was in fact submitted.
- **Renewed confirmation on effect change**: if the rebuilt transaction's effects differ from the originally confirmed effects (e.g. amount, destination, or memo changed because the authoritative state moved), the user must re-confirm before signing. Unchanged effects reuse the prior confirmation.
- **No duplicate payout**: if the authoritative operation status shows the original operation already succeeded, recovery reconciles to `confirmed` instead of rebuilding and re-submitting, so no second payout is issued.
- **Failure handling**: if the authoritative sequence/status fetch fails, recovery aborts with a recoverable error and leaves the transaction in `expired`; it is never rebuilt against unknown state.

## Multi-Step Signing Resilience (#199)

- **Per-step progress tracking**: a multi-step wallet signing flow records, for each step, whether it has been signed and whether it has been submitted. Progress is keyed by the step's stable identity (its idempotency key) so it survives a refresh and is scoped to the account/network/contract context.
- **Resume only the missing safe step**: on resume, completed steps (already signed and submitted) are skipped entirely — no re-signing and no re-submission. Only the first step that is not yet submitted is resumed. A step that was signed but not submitted reuses its persisted signed XDR rather than prompting the wallet again; a step that was never signed is signed fresh.
- **No duplicate submission**: a step marked submitted is never re-broadcast on resume, preserving the single-submit safety established in #196/#197. If a step's submission outcome is unknown, it is reconciled against authoritative operation status before any retry.
- **Wallet rejection vs. network failure**: failures are classified into two distinct kinds. A *wallet rejection* (user declined the signature, or the wallet returned a rejection) aborts the flow with a recoverable, user-facing "signature declined" message and leaves the step unsigned so it can be retried. A *network failure* (RPC/HTTP error, timeout, or transport error during submission) is surfaced as a retryable "network error" message and leaves the step in its last known signed/submitted state so resume can reconcile it. The two are never collapsed into a single generic error.
- **Refresh at a boundary**: refreshing after any completed step rehydrates progress and resumes at the next missing step without repeating completed work.
- **Disconnect at a boundary**: disconnecting mid-flow clears account-scoped progress for the previous account (consistent with #273) and leaves no stale pending markers; reconnecting resumes only the missing safe step.

## Tests

- `src/contexts/__tests__/walletContextTransitions.test.tsx`
  - account change during signing -> blocked, no `signTransaction`
  - wrong network before write -> blocked, no `signTransaction`
  - disconnect clears account-scoped pending tx UI state
- `src/contexts/__tests__/walletLeastPrivilege.test.tsx`
  - connect requests account access only, no `signTransaction`
  - denied account access -> no connected session, recoverable state
  - denied signing -> pending action aborted, no stale connected state
- `src/contexts/__tests__/walletPreSubmitRevalidation.test.tsx`
  - unchanged account/network/contract -> XDR submitted normally
  - account changed after confirmation -> submission aborted, recoverable message, no broadcast
  - network passphrase changed after confirmation -> submission aborted, recoverable message
  - contract identity changed after confirmation -> submission aborted, recoverable message
- `src/transactions/__tests__/transactionStateMachine.test.ts`
  - normal path: `built → signed → submitted → pending → confirmed`
  - failure path: `submitted → failed` and `pending → failed`
  - expiry/recovery path: persisted `pending` past expiry rehydrates as `expired`, not re-broadcast
  - authorization/guard path: illegal transitions (e.g. `built → confirmed`, `confirmed → pending`) throw typed `INVALID_TRANSITION` and leave state unchanged
  - persistence: only minimal recovery fields are serialized; terminal states drop the signed XDR
- `src/transactions/__tests__/expiredRecovery.test.ts`
  - normal path: expired tx fetches authoritative sequence + operation status, rebuilds with the same idempotency key
  - duplicate-payout guard: authoritative status shows original op succeeded -> reconciles to `confirmed`, no rebuild/re-submit
  - effect-change path: rebuilt effects differ -> renewed confirmation required before signing
  - unchanged-effects path: rebuilt effects match -> prior confirmation reused, no extra prompt
  - failure path: authoritative fetch fails -> recovery aborts, tx stays `expired`, no rebuild
- `src/transactions/__tests__/multiStepSigning.test.ts`
  - normal path: all steps signed and submitted in order, each step recorded as signed then submitted
  - resume path: refresh after step 1 submitted -> step 1 skipped, step 2 signed and submitted, no duplicate submission of step 1
  - resume path: refresh after step 1 signed but not submitted -> persisted signed XDR reused, no second `signTransaction` for step 1
  - wallet rejection: user declines signature at step 2 -> flow aborts with "signature declined", step 2 left unsigned, no submission
  - network failure: submission of step 2 fails with transport error -> surfaced as retryable "network error", step 2 left signed, resume reconciles before retry
  - disconnect at boundary: disconnect after step 1 submitted -> account-scoped progress cleared, no stale pending markers; reconnect resumes only step 2

## Safety

- No credentials or real user data in fixtures.
- Existing financial safety checks preserved; wrong-context writes fail closed.
- Expired-transaction recovery preserves idempotency keys and never rebuilds against unknown authoritative state, preventing duplicate payouts.
- Multi-step resume never re-signs or re-submits a completed step, and distinguishes wallet rejection from network failure so retries are safe and user-facing messages are accurate.
