-- Migration 001: Payout state and transitions schema (Issue #97)
-- Extended (Issue #258): cryptographic key-rotation metadata for stored payout fields.
-- Extended (Issue #197): typed transaction recovery state machine.
-- Extended (Issue #198): expiry recovery bookkeeping (authoritative sequence/op status,
--   preserved idempotency key, renewed-confirmation gate).
-- Extended (Issue #204): account-scoped chat search/export privacy bookkeeping.
-- Only key *identifiers* are persisted here; key material must never be stored in the database.
--
-- This file is applied by the checksummed migration runner in
-- `payoutMigrations.ts`. The runner records the SHA-256 checksum of this file
-- in `schema_migrations` and refuses to re-apply a migration whose checksum
-- has changed (see Issue #247). Keep this file immutable once applied; make
-- schema changes in a new numbered migration instead.

-- ---------------------------------------------------------------------------
-- Migration metadata (Issue #247)
-- ---------------------------------------------------------------------------
-- Records every applied migration together with its checksum so that repeat
-- applies are idempotent and drift is detected. `rollback_evidence` documents
-- the forward-recovery / rollback procedure for the migration.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  rollback_evidence TEXT
);

-- Coordination lock so concurrent runners cannot apply migrations in
-- parallel. A single row (id = 1) is used as an advisory lock; runners acquire
-- it with `SELECT ... FOR UPDATE` inside a transaction and release it on
-- commit/rollback.
CREATE TABLE IF NOT EXISTS migration_lock (
  id SMALLINT PRIMARY KEY,
  locked_by VARCHAR(128),
  locked_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT migration_lock_singleton CHECK (id = 1)
);

INSERT INTO migration_lock (id, locked_by, locked_at)
VALUES (1, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Payout schema (Issue #97)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payout_intents (
  id VARCHAR(64) PRIMARY KEY,
  idempotency_key VARCHAR(128) UNIQUE NOT NULL,
  contract_tx_hash VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  amount_minor_units BIGINT NOT NULL,
  currency VARCHAR(8) NOT NULL,
  provider_reference VARCHAR(128) UNIQUE,
  recipient_account_masked VARCHAR(32) NOT NULL,
  -- Key identifier (not key material) used to encrypt recipient_account_masked.
  -- NULL means the value predates encryption-at-rest and must be treated as legacy.
  recipient_account_key_id VARCHAR(64),
  -- Key identifier (not key material) used to encrypt provider_reference.
  provider_reference_key_id VARCHAR(64),
  -- Rotation bookkeeping: which key the row is being migrated to, and progress state.
  -- rotation_state: NULL (not rotating), 'pending', 'in_progress', 'completed', 'rolled_back'
  rotation_state VARCHAR(32),
  rotation_target_key_id VARCHAR(64),
  rotation_started_at TIMESTAMP WITH TIME ZONE,
  rotation_completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payout_state_transitions (
  id BIGSERIAL PRIMARY KEY,
  payout_id VARCHAR(64) REFERENCES payout_intents(id) ON DELETE CASCADE,
  from_status VARCHAR(32) NOT NULL,
  to_status VARCHAR(32) NOT NULL,
  reason TEXT,
  transitioned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Backward-compatible column additions for databases created before Issue #258.
-- ADD COLUMN IF NOT EXISTS keeps this migration idempotent and safe to re-run.
ALTER TABLE payout_intents ADD COLUMN IF NOT EXISTS recipient_account_key_id VARCHAR(64);
ALTER TABLE payout_intents ADD COLUMN IF NOT EXISTS provider_reference_key_id VARCHAR(64);
ALTER TABLE payout_intents ADD COLUMN IF NOT EXISTS rotation_state VARCHAR(32);
ALTER TABLE payout_intents ADD COLUMN IF NOT EXISTS rotation_target_key_id VARCHAR(64);
ALTER TABLE payout_intents ADD COLUMN IF NOT EXISTS rotation_started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE payout_intents ADD COLUMN IF NOT EXISTS rotation_completed_at TIMESTAMP WITH TIME ZONE;

-- ---------------------------------------------------------------------------
-- Typed transaction recovery state machine (Issue #197)
-- ---------------------------------------------------------------------------
-- Explicit states: built, signed, submitted, pending, confirmed, failed, expired.
-- The CHECK constraint makes impossible/unknown states detectable at the DB
-- boundary; the application layer additionally enforces allowed transitions.
ALTER TABLE payout_intents ADD COLUMN IF NOT EXISTS tx_state VARCHAR(16);
ALTER TABLE payout_intents ADD COLUMN IF NOT EXISTS tx_state_updated_at TIMESTAMP WITH TIME ZONE;

-- Minimum recovery data needed to resume/recover a transaction. Only opaque
-- identifiers and timestamps are persisted here; no key material or secrets.
ALTER TABLE payout_intents ADD COLUMN IF NOT EXISTS recovery_signed_tx_hash VARCHAR(64);
ALTER TABLE payout_intents ADD COLUMN IF NOT EXISTS recovery_submitted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE payout_intents ADD COLUMN IF NOT EXISTS recovery_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE payout_intents ADD COLUMN IF NOT EXISTS recovery_failure_code VARCHAR(64);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payout_intents_tx_state_check'
  ) THEN
    ALTER TABLE payout_intents
      ADD CONSTRAINT payout_intents_tx_state_check
      CHECK (tx_state IS NULL OR tx_state IN (
        'built', 'signed', 'submitted', 'pending', 'confirmed', 'failed', 'expired'
      ));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_payout_intents_tx_state ON payout_intents(tx_state);

-- ---------------------------------------------------------------------------
-- Expiry recovery bookkeeping (Issue #198)
-- ---------------------------------------------------------------------------
-- When a Soroban transaction expires we must NOT blindly rebuild it: a rebuild
-- can produce a different operation set and, if the original was actually
-- submitted, a second payout. These columns capture the authoritative facts
-- fetched before any rebuild so recovery is auditable and idempotent.
--
-- recovery_authoritative_sequence: account sequence number read from the
--   network (not the cached/local value) at recovery time.
-- recovery_operation_status: authoritative status of the original operation
--   ('not_found', 'pending', 'success', 'failed').
-- recovery_idempotency_key: the idempotency key carried across the rebuild.
--   It is copied from payout_intents.idempotency_key and never regenerated so
--   retries cannot create a duplicate payout.
-- recovery_effects_hash: hash of the rebuilt transaction's effects. When it
--   differs from the original, renewed user confirmation is required.
-- recovery_confirmation_state: NULL (not required), 'required', 'confirmed',
--   'rejected'.
ALTER TABLE payout_intents ADD COLUMN IF NOT EXISTS recovery_authoritative_sequence BIGINT;
ALTER TABLE payout_intents ADD COLUMN IF NOT EXISTS recovery_operation_status VARCHAR(32);
ALTER TABLE payout_intents ADD COLUMN IF NOT EXISTS recovery_idempotency_key VARCHAR(128);
ALTER TABLE payout_intents ADD COLUMN IF NOT EXISTS recovery_effects_hash VARCHAR(64);
ALTER TABLE payout_intents ADD COLUMN IF NOT EXISTS recovery_confirmation_state VARCHAR(32);
ALTER TABLE payout_intents ADD COLUMN IF NOT EXISTS recovery_rebuilt_at TIMESTAMP WITH TIME ZONE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payout_intents_recovery_operation_status_check'
  ) THEN
    ALTER TABLE payout_intents
      ADD CONSTRAINT payout_intents_recovery_operation_status_check
      CHECK (recovery_operation_status IS NULL OR recovery_operation_status IN (
        'not_found', 'pending', 'success', 'failed'
      ));
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Account-scoped chat search/export privacy (Issue #204)
-- ---------------------------------------------------------------------------
-- Search indexes and exports must only ever include the selected account's
-- permitted conversations. These tables record the account scope of every
-- indexed conversation and the deletion requests that must purge cached
-- records. Payout-sensitive fields are never stored here; the application
-- layer redacts them before indexing/exporting.
CREATE TABLE IF NOT EXISTS chat_search_index (
  id BIGSERIAL PRIMARY KEY,
  -- Owning account. Every query MUST filter on this column.
  account_id VARCHAR(128) NOT NULL,
  conversation_id VARCHAR(128) NOT NULL,
  message_id VARCHAR(128) NOT NULL,
  -- Redacted, searchable text. Payout-sensitive fields are stripped before
  -- insert; this column must never contain raw payout data.
  searchable_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (account_id, conversation_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_search_index_account
  ON chat_search_index(account_id);
CREATE INDEX IF NOT EXISTS idx_chat_search_index_account_conversation
  ON chat_search_index(account_id, conversation_id);

-- Deletion requests: when a user requests deletion, cached search/export
-- records for that account (and optionally a single conversation) must be
-- removed. `scope_conversation_id` NULL means the whole account.
CREATE TABLE IF NOT EXISTS chat_privacy_deletions (
  id BIGSERIAL PRIMARY KEY,
  account_id VARCHAR(128) NOT NULL,
  scope_conversation_id VARCHAR(128),
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_chat_privacy_deletions_account
  ON chat_privacy_deletions(account_id);
