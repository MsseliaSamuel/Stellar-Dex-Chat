import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import {
  TransactionProgressBar,
  clampProgressPercent,
  getStatusKindForStep,
  type TransactionStep,
} from '../TransactionProgressBar';
import { useReducedMotion } from '@/hooks/useReducedMotion';

vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: vi.fn(),
}));

vi.mock('@/hooks/useRtlDirection', () => ({
  useRtlDirection: () => ({ isRtl: false, dir: 'ltr' }),
}));

const mockedUseReducedMotion = vi.mocked(useReducedMotion);

describe('TransactionProgressBar status mapping', () => {
  const expected: Array<[TransactionStep, string]> = [
    ['idle', 'progress'],
    ['wallet_signing', 'progress'],
    ['confirming_on_chain', 'progress'],
    ['settled', 'success'],
    ['failed', 'failure'],
    ['retryable_error', 'warning'],
    ['read_only_outage', 'warning'],
  ];

  it.each(expected)('maps %s to a %s cue', (step, status) => {
    expect(getStatusKindForStep(step)).toBe(status);
  });

  it('clamps percentages and replaces non-finite values with zero', () => {
    expect(clampProgressPercent(-25)).toBe(0);
    expect(clampProgressPercent(0)).toBe(0);
    expect(clampProgressPercent(42)).toBe(42);
    expect(clampProgressPercent(100)).toBe(100);
    expect(clampProgressPercent(250)).toBe(100);
    expect(clampProgressPercent(Number.NaN)).toBe(0);
  });
});

describe('TransactionProgressBar accessibility', () => {
  beforeEach(() => {
    mockedUseReducedMotion.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('exposes a clamped progressbar and a polite live step description', () => {
    render(
      <TransactionProgressBar currentStep="submitting" progressPercent={250} />,
    );

    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('data-status', 'progress');
    expect(screen.getByText('100%')).toBeInTheDocument();

    const live = screen.getByRole('status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent('Submitting transaction to Stellar RPC...');
    expect(screen.getByTestId('transaction-status-cue')).toHaveAttribute(
      'data-status',
      'progress',
    );
  });

  it('uses an assertive alert for terminal failure and prefers the error text', () => {
    render(
      <TransactionProgressBar
        currentStep="failed"
        progressPercent={40}
        errorMessage="Payout rejected by provider"
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveTextContent('Payout rejected by provider');
    expect(screen.getByTestId('transaction-status-cue')).toHaveAttribute(
      'data-status',
      'failure',
    );
  });

  it('marks transient warning states without hiding the retry action', () => {
    const onRetry = vi.fn();
    render(
      <TransactionProgressBar
        currentStep="retryable_error"
        progressPercent={60}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByTestId('transaction-status-cue')).toHaveAttribute(
      'data-status',
      'warning',
    );
    screen.getByRole('button', { name: 'Retry Step' }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders cancel only when a handler is supplied', () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <TransactionProgressBar currentStep="failed" progressPercent={40} />,
    );
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();

    rerender(
      <TransactionProgressBar
        currentStep="failed"
        progressPercent={40}
        onCancel={onCancel}
      />,
    );
    screen.getByRole('button', { name: 'Cancel' }).click();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('keeps non-animated cues and drops transitions under reduced motion', () => {
    mockedUseReducedMotion.mockReturnValue(true);
    render(
      <TransactionProgressBar currentStep="submitting" progressPercent={10} />,
    );

    expect(screen.getByTestId('transaction-progress-bar')).toHaveAttribute(
      'data-reduced-motion',
      'true',
    );
    expect(screen.getByTestId('transaction-progress-fill')).not.toHaveClass(
      'transition-all',
    );
    expect(
      screen.getByTestId('transaction-status-cue').querySelector('svg'),
    ).not.toHaveClass('animate-spin');
    expect(screen.getByText('Status: In progress')).toBeInTheDocument();
  });

  it('uses a transition while motion is allowed', () => {
    render(
      <TransactionProgressBar currentStep="submitting" progressPercent={10} />,
    );
    expect(screen.getByTestId('transaction-progress-fill')).toHaveClass(
      'transition-all',
      'duration-300',
    );
  });
});
