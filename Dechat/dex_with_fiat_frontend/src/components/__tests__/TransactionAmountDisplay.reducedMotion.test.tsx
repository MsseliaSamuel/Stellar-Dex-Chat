import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TransactionAmountDisplay } from '../TransactionAmountDisplay';
import { useReducedMotion } from '@/hooks/useReducedMotion';

vi.mock('@/hooks/useCurrencyConversion', () => ({
  useCurrencyConversion: vi.fn(() => ({
    displayText: '100 XLM ≈ $12.40 USD',
    isLoading: false,
    hasError: false,
    fiatAmount: 12.4,
  })),
}));

vi.mock('@/contexts/UserPreferencesContext', () => ({
  useUserPreferences: () => ({ fiatCurrency: 'usd' }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren) => (
      <div {...props}>{children}</div>
    ),
    span: ({ children, ...props }: React.PropsWithChildren) => (
      <span {...props}>{children}</span>
    ),
  },
}));

vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: vi.fn(),
}));

const mockedUseReducedMotion = vi.mocked(useReducedMotion);

describe('TransactionAmountDisplay reduced motion', () => {
  beforeEach(() => {
    mockedUseReducedMotion.mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('scrolls instantly instead of smoothly when reduce is preferred', () => {
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView');
    render(<TransactionAmountDisplay amount={100} asset="XLM" />);

    expect(screen.getByTestId('transaction-amount-display')).toHaveAttribute(
      'data-reduced-motion',
      'true',
    );
    expect(scrollSpy).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'nearest',
    });
  });

  it('still shows the accessible error text with motion disabled', () => {
    // @ts-expect-error deliberately invalid amount to exercise failure path
    render(<TransactionAmountDisplay amount={-1} asset="XLM" />);
    expect(screen.getByText(/Amount must be positive/i)).toBeInTheDocument();
  });
});
