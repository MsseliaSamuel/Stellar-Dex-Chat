# Synthetic Test Fixtures

This repository uses deterministic, privacy-safe synthetic fixtures for wallets, bank accounts, webhooks, and payouts.

## Rules

- **Deterministic**: fixture generators accept a seed and return stable output for the same seed.
- **Synthetic only**: no real user data, production credentials, live provider keys, or private keys.
- **Obvious markers**: synthetic records include `synthetic: true` and `syn_`/`000...` prefixes where practical.
- **Public identifiers only**: Stellar public addresses/contract IDs in fixtures are non-secret test identifiers.

## Frontend

Central generators live in `src/lib/fixtures/`:

- `seededRandom.ts` - seeded PRNG/helpers
- `synthetic.ts` - wallet/bank/webhook/payout fixtures
- `privacyGuard.ts` - runtime/text fixture safety checks

Run checks:

```bash
pnpm test:fixtures:privacy
pnpm test:unit
```

## Contract fixtures

Contract JSON fixtures under `Dechat/stellar-contracts/fixtures/` must remain synthetic/public-only. The frontend privacy guard scans committed fixture directories, and contract tests should avoid embedding secrets or production identifiers.

## Event compatibility fixtures (golden events)

Every state-changing public contract method has a deterministic golden event fixture in
`Dechat/stellar-contracts/fixtures/events/golden_events.json`. Each entry snapshots the emitted
**topics** and **payload encoding** so that any change to an event's shape is caught by tests
rather than discovered in production indexers.

### Schema version

The fixture file carries an explicit top-level `schema_version` field. The regression test
(`golden_events` test) asserts that the committed fixtures match the current contract event
encoding for the normal path, and fails on:

- a `schema_version` mismatch between the fixture file and the expected version, or
- an unexpected topic or payload field change for any mutation.

### Changing an event

When you intentionally change an event's topics or payload fields:

1. Bump `schema_version` in `golden_events.json`.
2. Regenerate the affected fixtures so they reflect the new encoding.
3. Add a **compatibility note** in the PR description (and the relevant changelog) describing
   the old vs. new shape and the migration impact for indexers/consumers.

A field or topic change without a `schema_version` bump and compatibility note is treated as a
regression and will fail the contract checks.

### Regenerating fixtures

Regenerate golden events from the contract test harness after an intentional change, then run:

```bash
cargo test -p <contract-crate> golden_events
```

Keep fixtures synthetic: use public test addresses/contract IDs only, never real user data or
credentials.

## Client cache partitioning fixtures

Portfolio, history, and payout caches are partitioned by the full account/network identity
(wallet address + network passphrase) plus a schema/data version component. Fixtures for these
caches live alongside the other frontend fixtures and must exercise the partitioning and
invalidation paths.

### Cache key shape

A cache key is composed of:

- `wallet` — the Stellar public address (synthetic/public test identifier only).
- `network` — the network passphrase (e.g. `Test SDF Network ; September 2015`).
- `schemaVersion` — the client data/schema version the cached payload was written under.

Fixtures must use distinct synthetic wallets and networks so that cross-partition leakage is
detectable.

### Invalidation cases covered by fixtures

- **Disconnect** — disconnecting a wallet clears all cache partitions for that wallet/network.
- **Account change** — switching accounts must not surface another account's cached portfolio,
  history, or payout data.
- **Schema version change** — a cached payload written under an incompatible `schemaVersion` is
  treated as a miss and refetched rather than served stale.

### Running the cache fixtures

```bash
pnpm test:unit -- cache
```

Cache fixtures are deterministic and synthetic: they use only public test addresses and network
passphrases, never real user data or credentials.

## Emergency pause / recovery drill

The operator drill for emergency pause and recovery is a repeatable testnet/local-network
simulation. It exercises the pause guard, read-only views, queued liabilities, and authorized
recovery without touching real funds or credentials.

### What the drill covers

1. **Pause** — an authorized operator pauses the contract. The drill asserts the pause flag is
   set and that a `paused` event is emitted (see the golden events fixture).
2. **Blocked mutations** — every state-changing entry point (deposits, withdrawals, swaps,
   payout settlement, etc.) must reject with the contract's paused error while paused.
3. **Available views** — read-only queries (balances, queued liabilities, config) must continue
   to succeed and return the pre-pause values.
4. **Queued liabilities** — liabilities queued before the pause must be preserved unchanged and
   must not be silently dropped or double-counted.
5. **Recovery** — an authorized operator unpauses the contract; the drill asserts the pause flag
   is cleared, a `resumed`/`unpaused` event is emitted, and previously queued liabilities are
   processed exactly once on the next settlement.

### Failure and authorization cases

The drill also covers the negative paths:

- A non-operator (unauthorized) caller attempting to pause must fail with an authorization error
  and leave the pause flag unchanged.
- A non-operator attempting to unpause must fail with an authorization error and leave the
  contract paused.
- Mutations attempted while paused must fail without mutating balances or liabilities.

### Running the drill

Run the drill against a local network or testnet using synthetic operator keys only:

```bash
cargo test -p <contract-crate> pause_recovery_drill
```

The drill is deterministic and safe to re-run; it uses only synthetic/public test identifiers and
never real user data or credentials.
