import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import WalletConnectionTimeline from '../WalletConnectionTimeline';
import { useReducedMotion } from '@/hooks/useReducedMotion';

vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: vi.fn(),
}));

const mockedUseReducedMotion = vi.mocked(useReducedMotion);

const baseProps = {
  isConnected: false,
  isNetworkMismatch: false,
  isConnecting: false,
};

describe('WalletConnectionTimeline status cues', () => {
  beforeEach(() => {
    mockedUseReducedMotion.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('animates the active step only when motion is allowed', () => {
    const { rerender } = render(
      <WalletConnectionTimeline {...baseProps} isConnecting />,
    );

    const activeDots = screen
      .getAllByTestId('wallet-timeline-dot')
      .filter((dot) => dot.getAttribute('data-status') === 'active');
    expect(activeDots).toHaveLength(2);
    activeDots.forEach((dot) => expect(dot).toHaveClass('animate-pulse'));

    mockedUseReducedMotion.mockReturnValue(true);
    rerender(<WalletConnectionTimeline {...baseProps} isConnecting />);
    screen
      .getAllByTestId('wallet-timeline-dot')
      .filter((dot) => dot.getAttribute('data-status') === 'active')
      .forEach((dot) => expect(dot).not.toHaveClass('animate-pulse'));
  });

  it('exposes non-animated text status for every step', () => {
    const { container } = render(<WalletConnectionTimeline {...baseProps} />);

    expect(container.textContent).toContain('(not started)');
    expect(container.querySelectorAll('.sr-only').length).toBeGreaterThan(0);
  });

  it('uses assertive alert text for a wallet drop during a transfer', () => {
    const onDisconnectMidTransfer = vi.fn();
    const { rerender } = render(
      <WalletConnectionTimeline
        {...baseProps}
        isConnected
        transferInProgress
        onDisconnectMidTransfer={onDisconnectMidTransfer}
      />,
    );
    expect(onDisconnectMidTransfer).not.toHaveBeenCalled();

    rerender(
      <WalletConnectionTimeline
        {...baseProps}
        transferInProgress
        onDisconnectMidTransfer={onDisconnectMidTransfer}
      />,
    );

    expect(onDisconnectMidTransfer).toHaveBeenCalledTimes(1);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveTextContent(
      'Wallet disconnected mid-transfer. Please reconnect and retry.',
    );
    expect(screen.getAllByText(/needs attention/).length).toBeGreaterThan(0);
  });
});
