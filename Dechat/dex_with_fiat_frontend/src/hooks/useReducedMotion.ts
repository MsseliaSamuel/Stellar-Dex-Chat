'use client';

import { useMediaQuery } from '@/hooks/useMediaQuery';

/** Canonical media query used for every motion-sensitive surface. */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Returns `true` when the user has asked the operating system to minimise
 * non-essential motion. Thin wrapper around the shared `useMediaQuery` hook so
 * every status surface reacts to the same query and to runtime preference
 * changes (for example, toggling the setting while the app is open).
 *
 * During SSR it returns `false`; hydration then picks up the real preference.
 */
export function useReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION_QUERY);
}
