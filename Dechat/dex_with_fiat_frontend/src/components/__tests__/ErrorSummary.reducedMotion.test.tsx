import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ErrorSummary from '../ErrorSummary';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { AccessibleError } from '@/lib/errorMessages';

vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: vi.fn(),
}));

const mockedUseReducedMotion = vi.mocked(useReducedMotion);

const failure: AccessibleError = {
  message: 'Payout failed. No funds were sent.',
  action: 'Retry the payout.',
  category: 'contract',
  isRetryable: true,
};

describe('ErrorSummary reduced motion', () => {
  beforeEach(() => {
    mockedUseReducedMotion.mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('scrolls instantly to an assertive failure summary', () => {
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView');
    render(<ErrorSummary id="payout-error" error={failure} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveTextContent('Payout failed. No funds were sent.');
    expect(scrollSpy).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'nearest',
    });
  });
});
