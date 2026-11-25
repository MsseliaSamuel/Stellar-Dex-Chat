# DEX with Fiat Frontend

A React + TypeScript frontend for a decentralized exchange that supports fiat on-ramp flows and wallet-based trading.

## Getting started

```bash
npm install
npm run dev
```

## Wallet permissions

The app follows a least-privilege wallet model: each action requests only the
account or signing capability it actually needs, and permission prompts are
explained in the UI at the point of request.

| Action | Wallet request |
| --- | --- |
| View balances / portfolio | Read-only account access (`eth_requestAccounts`) |
| Place / cancel an order | Transaction signing for that single transaction |
| Fiat on-ramp handoff | Read-only account access only |

### Denial handling

If a user rejects a permission or signing prompt, the app does **not** create a
partially authenticated session. The pending action is aborted, no connected
state is persisted for that request, and the UI returns to a recoverable state
where the user can retry or continue browsing without a wallet.

### Pre-submit revalidation

After the user confirms a transaction and immediately before the signed XDR is
submitted, the app re-reads the active wallet address, the network passphrase,
and the configured contract identity. If any of these values changed since the
user confirmed (for example the wallet switched accounts or networks, or the
configured contract was updated), submission is aborted with a recoverable,
user-facing message. No transaction is submitted in that case; the user can
review the new state and retry. Existing safety properties (double-submit
protection and audit logging) are preserved across this check.

### Client cache partitioning

Portfolio, history, and payout caches are keyed by the full account/network
identity rather than a single global key. Each cache entry is namespaced by:

- the active wallet address,
- the network passphrase (e.g. `Test SDF Network ; September 2015`), and
- a schema/data version component.

This prevents data from one wallet or network leaking into another when the
user switches accounts or networks in the same browser session.

Caches are invalidated (dropped, not just re-keyed) when:

- the wallet disconnects,
- the active account changes, or
- the stored data version is incompatible with the current schema version
  (for example after a deploy that changes the cache shape).

On invalidation the affected views refetch from the API instead of rendering
stale entries, so a user never sees another account's portfolio, history, or
payout state.

### Compatibility notes

## Contract deployment manifest

Every deployment publishes a machine-readable manifest so operators and the
frontend can verify they are talking to the intended contract on the intended
network. The manifest is a JSON document with the following fields:

| Field | Description |
| --- | --- |
| `network` | Target network identifier (e.g. `testnet`, `mainnet`). |
| `wasmHash` | Hash of the deployed Wasm artifact. |
| `contractId` | Deployed contract ID (address). |
| `specVersion` | Contract spec version the artifact was built from. |
| `admin` | Required admin configuration (admin address / role). |
| `oracle` | Required oracle configuration (oracle address / feed). |

Example:

```json
{
  "network": "testnet",
  "wasmHash": "<sha256-of-wasm>",
  "contractId": "C...",
  "specVersion": "1.0.0",
  "admin": { "address": "G..." },
  "oracle": { "address": "G...", "feed": "XLM/USD" }
}
```

### Validation

Before the manifest is accepted, it is validated against the deployed artifact:

- `wasmHash` must match the hash of the deployed Wasm artifact.
- `contractId` must match the deployed contract ID.
- `specVersion` must match the spec version reported by the deployed contract.
- `admin` and `oracle` must be present and well-formed.

### Cross-network rejection

If the manifest's `network` does not match the deployment target network, the
manifest is rejected. This prevents accidentally pointing a deployment (or the
frontend) at a contract on a different network. Validation fails closed: a
mismatched or incomplete manifest is never treated as valid.

### Regression coverage

Focused tests cover the normal path (a manifest matching the deployed artifact
validates successfully) and the failure edge cases (Wasm hash / contract ID /
spec version mismatch, missing admin/oracle configuration, and a cross-network
manifest being rejected).

## Development

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
