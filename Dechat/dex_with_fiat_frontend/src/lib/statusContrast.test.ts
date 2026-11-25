import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CONTRAST_MODES,
  DARK_STATUS_TOKENS,
  FORCED_COLORS_TOKENS,
  LIGHT_STATUS_TOKENS,
  MIN_NON_TEXT_CONTRAST,
  MIN_TEXT_CONTRAST,
  STATUS_KINDS,
  THEME_SURFACES,
  computeContrastRatio,
  getStatusTokens,
  meetsAA,
  relativeLuminance,
  validateStatusContrast,
} from './statusContrast';

const globalsCss = readFileSync(
  resolve(process.cwd(), 'src/app/globals.css'),
  'utf8',
);

describe('statusContrast — WCAG math', () => {
  it('computes the canonical 21:1 and 1:1 ratios', () => {
    expect(computeContrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2);
    expect(computeContrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 2);
    expect(computeContrastRatio('#ffffff', '#ffffff')).toBe(1);
  });

  it('computes relative luminance bounds', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('is symmetric and rejects malformed colours', () => {
    const first = computeContrastRatio('#1d4ed8', '#eff6ff');
    const second = computeContrastRatio('#eff6ff', '#1d4ed8');
    expect(first).toBeCloseTo(second, 10);
    expect(() => computeContrastRatio('blue', '#ffffff')).toThrow(TypeError);
    expect(() => computeContrastRatio('#fff', '#ffffff')).toThrow(TypeError);
  });

  it('applies custom thresholds for non-text contrast', () => {
    expect(meetsAA('#1d4ed8', '#eff6ff', MIN_TEXT_CONTRAST)).toBe(true);
    expect(meetsAA('#1d4ed8', '#eff6ff', MIN_NON_TEXT_CONTRAST)).toBe(true);
    expect(meetsAA('#ffffff', '#ffffff', MIN_TEXT_CONTRAST)).toBe(false);
  });
});

describe('statusContrast — token validation', () => {
  it('exposes every status in every mode', () => {
    expect(STATUS_KINDS).toHaveLength(4);
    expect(CONTRAST_MODES).toEqual(['light', 'dark', 'forced-colors']);
    for (const mode of CONTRAST_MODES) {
      for (const status of STATUS_KINDS) {
        expect(getStatusTokens(status, mode)).toBeDefined();
      }
    }
  });

  it('returns the correct token tables for light and dark', () => {
    expect(getStatusTokens('warning', 'light')).toEqual(
      LIGHT_STATUS_TOKENS.warning,
    );
    expect(getStatusTokens('failure', 'dark')).toEqual(
      DARK_STATUS_TOKENS.failure,
    );
  });

  it('validates all light and dark status pairs at WCAG AA (normal path)', () => {
    const results = validateStatusContrast();
    expect(results).toHaveLength(8);

    for (const result of results) {
      expect(result.meetsTextAA, `${result.mode}/${result.status}`).toBe(true);
      expect(result.meetsNonTextAA, `${result.mode}/${result.status}`).toBe(
        true,
      );
      expect(result.foregroundRatio).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
      expect(result.surfaceRatio).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    }
  });

  it('keeps every status token distinct (no colour-only duplication)', () => {
    for (const table of [LIGHT_STATUS_TOKENS, DARK_STATUS_TOKENS]) {
      const foregrounds = STATUS_KINDS.map(
        (status) => table[status].foreground,
      );
      expect(new Set(foregrounds).size).toBe(STATUS_KINDS.length);
    }
  });

  it('uses system colours in forced-colors mode, never hard-coded hex', () => {
    for (const status of STATUS_KINDS) {
      expect(FORCED_COLORS_TOKENS[status]).toEqual({
        foreground: 'CanvasText',
        background: 'Canvas',
        border: 'CanvasText',
      });
    }
  });

  it('keeps CSS custom properties in sync with the validated tokens', () => {
    for (const status of STATUS_KINDS) {
      for (const property of ['fg', 'bg'] as const) {
        const matches = [
          ...globalsCss.matchAll(
            new RegExp(
              `--status-${status}-${property}:\\s*(#[0-9a-f]{6});`,
              'gi',
            ),
          ),
        ].map((match) => match[1].toLowerCase());

        // Exactly one light value (:root) and one dark value ([data-theme]).
        expect(matches, `${status}/${property}`).toHaveLength(2);
        expect(matches[0]).toBe(
          LIGHT_STATUS_TOKENS[status][
            property === 'fg' ? 'foreground' : 'background'
          ].toLowerCase(),
        );
        expect(matches[1]).toBe(
          DARK_STATUS_TOKENS[status][
            property === 'fg' ? 'foreground' : 'background'
          ].toLowerCase(),
        );
      }
    }
  });

  it('guards the documented minimum ratios against regressions', () => {
    const results = validateStatusContrast();
    const warning = results.find(
      (result) => result.mode === 'light' && result.status === 'warning',
    );
    // Regression guard: the old --color-warning (#d97706) only reached ~2.6:1.
    expect(warning?.foregroundRatio).toBeGreaterThan(4.5);
    expect(meetsAA('#d97706', THEME_SURFACES.light, MIN_TEXT_CONTRAST)).toBe(
      false,
    );
  });
});

describe('statusContrast — CSS motion/high-contract surfaces', () => {
  it('declares a reduced-motion block that neutralises animations', () => {
    expect(globalsCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(globalsCss).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(globalsCss).toMatch(/scroll-behavior:\s*auto/);
  });

  it('declares a prefers-contrast block that reinforces status boundaries', () => {
    expect(globalsCss).toMatch(/@media\s*\(prefers-contrast:\s*more\)/);
    expect(globalsCss).toMatch(/border-width:\s*2px/);
  });

  it('declares forced-colors rules for status cues and the progress fill', () => {
    expect(globalsCss).toMatch(/@media\s*\(forced-colors:\s*active\)/);
    expect(globalsCss).toMatch(/\[data-testid='transaction-status-cue'\]/);
    expect(globalsCss).toMatch(/background-color:\s*Highlight/);
  });
});
