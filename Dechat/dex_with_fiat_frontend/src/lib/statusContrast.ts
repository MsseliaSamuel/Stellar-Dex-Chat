/**
 * Status colour tokens and WCAG 2.1 AA contrast validation (issue #295).
 *
 * The values here are the single source of truth for the CSS custom properties
 * declared in `src/app/globals.css`. They are intentionally foreground colours
 * with a >= 4.5:1 ratio against both their soft background and the surrounding
 * theme surface, in both light and dark themes. The pre-existing
 * `--color-success` / `--color-warning` tokens are used as *soft fills* and do
 * not meet AA as text colours, so status text must not use them directly.
 *
 * Financial-safety note: this module is display-only. It never reads or writes
 * amounts, stroops, minor units, or any transaction state.
 */

export type StatusKind = 'progress' | 'success' | 'warning' | 'failure';
export type ContrastMode = 'light' | 'dark' | 'forced-colors';

export interface StatusTokens {
  foreground: string;
  background: string;
  border: string;
}

export interface ContrastResult {
  status: StatusKind;
  mode: Exclude<ContrastMode, 'forced-colors'>;
  foreground: string;
  background: string;
  foregroundRatio: number;
  surfaceRatio: number;
  meetsTextAA: boolean;
  meetsNonTextAA: boolean;
}

/** WCAG 2.1 AA thresholds (1.4.3 text, 1.4.11 non-text). */
export const MIN_TEXT_CONTRAST = 4.5;
export const MIN_NON_TEXT_CONTRAST = 3;

export const STATUS_KINDS: readonly StatusKind[] = [
  'progress',
  'success',
  'warning',
  'failure',
] as const;

export const CONTRAST_MODES: readonly ContrastMode[] = [
  'light',
  'dark',
  'forced-colors',
] as const;

/** Hex tokens for the light theme. Mirrored by `:root` in globals.css. */
export const LIGHT_STATUS_TOKENS: Record<StatusKind, StatusTokens> = {
  progress: {
    foreground: '#1d4ed8',
    background: '#eff6ff',
    border: '#1d4ed8',
  },
  success: {
    foreground: '#15803d',
    background: '#f0fdf4',
    border: '#15803d',
  },
  warning: {
    foreground: '#92400e',
    background: '#fffbeb',
    border: '#92400e',
  },
  failure: {
    foreground: '#991b1b',
    background: '#fef2f2',
    border: '#991b1b',
  },
};

/** Hex tokens for the dark theme. Mirrored by `[data-theme='dark']`. */
export const DARK_STATUS_TOKENS: Record<StatusKind, StatusTokens> = {
  progress: {
    foreground: '#93c5fd',
    background: '#11233f',
    border: '#93c5fd',
  },
  success: {
    foreground: '#86efac',
    background: '#052e16',
    border: '#86efac',
  },
  warning: {
    foreground: '#fcd34d',
    background: '#451a03',
    border: '#fcd34d',
  },
  failure: {
    foreground: '#fca5a5',
    background: '#450a0a',
    border: '#fca5a5',
  },
};

/**
 * High-contrast mode deliberately uses CSS system colours instead of hex
 * values: the browser/OS decides the actual palette, so hard-coding colours
 * would defeat the user's choice. The status is still conveyed by icon shape
 * and text (see TransactionStatusCue), never by colour alone.
 */
export const FORCED_COLORS_TOKENS: Record<StatusKind, StatusTokens> = {
  progress: {
    foreground: 'CanvasText',
    background: 'Canvas',
    border: 'CanvasText',
  },
  success: {
    foreground: 'CanvasText',
    background: 'Canvas',
    border: 'CanvasText',
  },
  warning: {
    foreground: 'CanvasText',
    background: 'Canvas',
    border: 'CanvasText',
  },
  failure: {
    foreground: 'CanvasText',
    background: 'Canvas',
    border: 'CanvasText',
  },
};

/** Representative theme surface colours used for the "against surface" check. */
export const THEME_SURFACES: Record<'light' | 'dark', string> = {
  light: '#ffffff',
  dark: '#0f172a',
};

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  if (!HEX_PATTERN.test(hex)) {
    throw new TypeError(`Expected a 6-digit hex colour, received "${hex}"`);
  }
  const value = hex.slice(1);
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function channelLuminance(channel: number): number {
  const normalised = channel / 255;
  return normalised <= 0.03928
    ? normalised / 12.92
    : Math.pow((normalised + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance (0..1) for a 6-digit hex colour. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

/** WCAG contrast ratio (1..21) between two 6-digit hex colours. */
export function computeContrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** `true` when the pair passes the given WCAG AA threshold. */
export function meetsAA(
  foreground: string,
  background: string,
  minimum: number = MIN_TEXT_CONTRAST,
): boolean {
  return computeContrastRatio(foreground, background) >= minimum;
}

export function getStatusTokens(
  status: StatusKind,
  mode: ContrastMode,
): StatusTokens {
  switch (mode) {
    case 'light':
      return LIGHT_STATUS_TOKENS[status];
    case 'dark':
      return DARK_STATUS_TOKENS[status];
    case 'forced-colors':
      return FORCED_COLORS_TOKENS[status];
  }
}

/**
 * Validate every status token pair against its soft background and the
 * surrounding theme surface. Exposed so tests and docs can assert the same
 * numbers that the CSS variables encode.
 */
export function validateStatusContrast(): ContrastResult[] {
  const modes: Array<'light' | 'dark'> = ['light', 'dark'];
  return modes.flatMap((mode) => {
    const tokens = mode === 'light' ? LIGHT_STATUS_TOKENS : DARK_STATUS_TOKENS;
    return STATUS_KINDS.map((status) => {
      const { foreground, background } = tokens[status];
      const foregroundRatio = computeContrastRatio(foreground, background);
      const surfaceRatio = computeContrastRatio(
        foreground,
        THEME_SURFACES[mode],
      );
      return {
        status,
        mode,
        foreground,
        background,
        foregroundRatio,
        surfaceRatio,
        meetsTextAA:
          foregroundRatio >= MIN_TEXT_CONTRAST &&
          surfaceRatio >= MIN_TEXT_CONTRAST,
        meetsNonTextAA: foregroundRatio >= MIN_NON_TEXT_CONTRAST,
      };
    });
  });
}
