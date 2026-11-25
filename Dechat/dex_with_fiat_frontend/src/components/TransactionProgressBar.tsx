'use client';

import React from 'react';
import clsx from 'clsx';
import { useRtlDirection } from '@/hooks/useRtlDirection';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { TransactionStatusCue } from '@/components/TransactionStatusCue';
import type { StatusKind } from '@/lib/statusContrast';

export type TransactionStep =
  | 'idle'
  | 'wallet_signing'
  | 'submitting'
  | 'confirming_on_chain'
  | 'provider_dispatch'
  | 'settled'
  | 'failed'
  | 'retryable_error'
  | 'read_only_outage';

export interface TransactionProgressBarProps {
  currentStep: TransactionStep;
  progressPercent: number; // 0 to 100
  title?: string;
  errorMessage?: string;
  onRetry?: () => void;
  onCancel?: () => void;
}

const STEP_LABELS: Record<TransactionStep, string> = {
  idle: 'Ready to initiate transaction',
  wallet_signing: 'Waiting for Freighter wallet approval...',
  submitting: 'Submitting transaction to Stellar RPC...',
  confirming_on_chain: 'Awaiting consensus confirmation on-chain...',
  provider_dispatch: 'Contract confirmed! Dispatching fiat payout provider...',
  settled: 'Transaction & Payout completed successfully!',
  failed: 'Transaction encountered a terminal error.',
  retryable_error: 'Transient network glitch. Ready to retry.',
  read_only_outage: 'RPC outage detected. Action paused safely.',
};

/** Map a transaction step to a non-animated, AA-contrast status cue. */
export function getStatusKindForStep(step: TransactionStep): StatusKind {
  if (step === 'settled') return 'success';
  if (step === 'failed') return 'failure';
  if (step === 'retryable_error' || step === 'read_only_outage') {
    return 'warning';
  }
  return 'progress';
}

/** Clamp the reported percentage so ARIA and the fill width always agree. */
export function clampProgressPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export const TransactionProgressBar: React.FC<TransactionProgressBarProps> = ({
  currentStep,
  progressPercent,
  title,
  errorMessage,
  onRetry,
  onCancel,
}) => {
  const { dir } = useRtlDirection();
  const reducedMotion = useReducedMotion();
  const isFailed = currentStep === 'failed';
  const isRetryable = currentStep === 'retryable_error';

  const status = getStatusKindForStep(currentStep);
  const safeProgress = clampProgressPercent(progressPercent);
  const description = errorMessage || STEP_LABELS[currentStep];
  const isAlert = status === 'failure';

  return (
    <div
      role="progressbar"
      data-testid="transaction-progress-bar"
      data-status={status}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      dir={dir}
      aria-valuenow={safeProgress}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={title || STEP_LABELS[currentStep]}
      className="w-full p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 uppercase tracking-wide">
          {title || 'Transaction Progress'}
        </span>
        <span className="text-xs font-mono font-medium text-gray-500 dark:text-gray-400">
          {safeProgress}%
        </span>
      </div>

      {/* Progress track — colour is never the only status signal (issue #295). */}
      <div className="w-full h-2.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden mb-3">
        <div
          data-testid="transaction-progress-fill"
          className={clsx(
            'status-progress-fill',
            `status-fill-${status}`,
            !reducedMotion && 'transition-all duration-300 ease-out',
          )}
          style={{ width: `${safeProgress}%` }}
        />
      </div>

      {/* Step description: polite updates, assertive for terminal failure. */}
      <div
        role={isAlert ? 'alert' : 'status'}
        aria-live={isAlert ? 'assertive' : 'polite'}
        aria-atomic="true"
        className="mb-2 flex flex-wrap items-center gap-2"
      >
        <TransactionStatusCue status={status} />
        <p className="text-xs text-gray-700 dark:text-gray-300">
          {description}
        </p>
      </div>

      {/* Action buttons if in retryable or failed state */}
      {(isRetryable || isFailed) && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
          {isRetryable && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-3 py-1 bg-amber-800 hover:bg-amber-900 text-white rounded text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              Retry Step
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded text-xs font-medium"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default TransactionProgressBar;
