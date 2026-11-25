import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { STATUS_LABELS, TransactionStatusCue } from '../TransactionStatusCue';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { STATUS_KINDS } from '@/lib/statusContrast';

vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: vi.fn(),
}));

const mockedUseReducedMotion = vi.mocked(useReducedMotion);

describe('TransactionStatusCue', () => {
  beforeEach(() => {
    mockedUseReducedMotion.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it.each(STATUS_KINDS)(
    'renders a non-animated icon + text cue for %s',
    (status) => {
      render(<TransactionStatusCue status={status} />);
      const cue = screen.getByTestId('transaction-status-cue');

      expect(cue).toHaveAttribute('data-status', status);
      expect(cue).toHaveClass('status-cue', `status-${status}`);
      expect(cue.querySelector('svg')).toBeInTheDocument();
      expect(screen.getByText(STATUS_LABELS[status])).toBeInTheDocument();
      expect(screen.getByText(`Status: ${STATUS_LABELS[status]}`)).toHaveClass(
        'sr-only',
      );
    },
  );

  it('spins the progress icon only while motion is allowed', () => {
    const { unmount } = render(<TransactionStatusCue status="progress" />);
    expect(
      screen.getByTestId('transaction-status-cue').querySelector('svg'),
    ).toHaveClass('animate-spin');

    unmount();
    mockedUseReducedMotion.mockReturnValue(true);
    render(<TransactionStatusCue status="progress" />);

    const cue = screen.getByTestId('transaction-status-cue');
    expect(cue).toHaveAttribute('data-reduced-motion', 'true');
    expect(cue.querySelector('svg')).not.toHaveClass('animate-spin');
  });

  it('never animates warning or failure icons', () => {
    for (const status of ['warning', 'failure', 'success'] as const) {
      const { unmount } = render(<TransactionStatusCue status={status} />);
      expect(
        screen.getByTestId('transaction-status-cue').querySelector('svg'),
      ).not.toHaveClass('animate-spin');
      unmount();
    }
  });

  it('keeps the accessible label when reduced motion is enabled', () => {
    mockedUseReducedMotion.mockReturnValue(true);
    render(<TransactionStatusCue status="failure" label="Payout failed" />);

    expect(screen.getByText('Payout failed')).toBeInTheDocument();
    expect(screen.getByText('Status: Payout failed')).toBeInTheDocument();
  });
});
