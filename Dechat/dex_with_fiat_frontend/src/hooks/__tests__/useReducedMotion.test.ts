import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMediaQuery } from '../useMediaQuery';
import { REDUCED_MOTION_QUERY, useReducedMotion } from '../useReducedMotion';

vi.mock('../useMediaQuery', () => ({
  useMediaQuery: vi.fn(),
}));

const mockedUseMediaQuery = vi.mocked(useMediaQuery);

describe('useReducedMotion', () => {
  beforeEach(() => {
    mockedUseMediaQuery.mockReset();
    mockedUseMediaQuery.mockReturnValue(false);
  });

  it('queries the canonical reduced-motion media feature', () => {
    renderHook(() => useReducedMotion());
    expect(mockedUseMediaQuery).toHaveBeenCalledWith(REDUCED_MOTION_QUERY);
    expect(REDUCED_MOTION_QUERY).toBe('(prefers-reduced-motion: reduce)');
  });

  it('returns false when the user has not requested reduced motion', () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('returns true when the preference is enabled', () => {
    mockedUseMediaQuery.mockReturnValue(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('reflects a runtime preference change', () => {
    mockedUseMediaQuery.mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { result, rerender } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    rerender();
    expect(result.current).toBe(true);
  });
});
