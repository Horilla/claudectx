import { describe, it, expect } from 'vitest';
import {
  detectClaudeMdWarnings,
  detectMemoryWarnings,
  detectMissingIgnoreFile,
} from '../../../src/analyzer/waste-detector.js';
import { WASTE_THRESHOLDS } from '../../../src/shared/constants.js';

describe('detectClaudeMdWarnings — OVERSIZED_CLAUDEMD', () => {
  it('does NOT flag CLAUDE.md at exactly the threshold', () => {
    const warnings = detectClaudeMdWarnings('x', WASTE_THRESHOLDS.MAX_CLAUDEMD_TOKENS, 0);
    expect(warnings.some((w) => w.code === 'OVERSIZED_CLAUDEMD')).toBe(false);
  });

  it('flags CLAUDE.md above the threshold', () => {
    const warnings = detectClaudeMdWarnings('x', WASTE_THRESHOLDS.MAX_CLAUDEMD_TOKENS + 1, 0);
    expect(warnings.some((w) => w.code === 'OVERSIZED_CLAUDEMD')).toBe(true);
  });

  it('does NOT flag small CLAUDE.md (1200 tokens)', () => {
    const warnings = detectClaudeMdWarnings('x', 1200, 0);
    expect(warnings.some((w) => w.code === 'OVERSIZED_CLAUDEMD')).toBe(false);
  });

  it('flags large CLAUDE.md with correct savings estimate', () => {
    const tokenCount = 8000;
    const warnings = detectClaudeMdWarnings('x', tokenCount, 0);
    const w = warnings.find((w) => w.code === 'OVERSIZED_CLAUDEMD');
    expect(w).toBeDefined();
    expect(w!.estimatedSavings).toBe(tokenCount - WASTE_THRESHOLDS.MAX_CLAUDEMD_TOKENS);
  });
});

describe('detectClaudeMdWarnings — CACHE_BUSTING_CONTENT', () => {
  it('flags a date string', () => {
    const content = '# My Project\nLast updated: 2026-04-11\n\nDo stuff.';
    const warnings = detectClaudeMdWarnings(content, 100, 0);
    expect(warnings.some((w) => w.code === 'CACHE_BUSTING_CONTENT')).toBe(true);
  });

  it('flags a time string', () => {
    const content = '# Project\nBuild time: 14:32:09\n\nDo stuff.';
    const warnings = detectClaudeMdWarnings(content, 100, 0);
    expect(warnings.some((w) => w.code === 'CACHE_BUSTING_CONTENT')).toBe(true);
  });

  it('flags a "Last updated:" line', () => {
    const content = '# Project\nLast updated: Friday\n\nDo stuff.';
    const warnings = detectClaudeMdWarnings(content, 100, 0);
    expect(warnings.some((w) => w.code === 'CACHE_BUSTING_CONTENT')).toBe(true);
  });

  it('does NOT flag clean content', () => {
    const content = '# Project\n\n## Rules\n\nAlways use TypeScript.\nNever use any.';
    const warnings = detectClaudeMdWarnings(content, 100, 0);
    expect(warnings.some((w) => w.code === 'CACHE_BUSTING_CONTENT')).toBe(false);
  });
});

describe('detectClaudeMdWarnings — TOO_MANY_REFERENCES', () => {
  it('does NOT flag when references ≤ threshold', () => {
    const warnings = detectClaudeMdWarnings('x', 100, WASTE_THRESHOLDS.MAX_REFERENCE_COUNT);
    expect(warnings.some((w) => w.code === 'TOO_MANY_REFERENCES')).toBe(false);
  });

  it('flags when references > threshold', () => {
    const warnings = detectClaudeMdWarnings('x', 100, WASTE_THRESHOLDS.MAX_REFERENCE_COUNT + 1);
    expect(warnings.some((w) => w.code === 'TOO_MANY_REFERENCES')).toBe(true);
  });
});

describe('detectMemoryWarnings — OVERSIZED_MEMORY', () => {
  it('does NOT flag MEMORY.md at exactly the threshold', () => {
    const warnings = detectMemoryWarnings('x', WASTE_THRESHOLDS.MAX_MEMORY_TOKENS);
    expect(warnings.some((w) => w.code === 'OVERSIZED_MEMORY')).toBe(false);
  });

  it('flags MEMORY.md above the threshold', () => {
    const warnings = detectMemoryWarnings('x', WASTE_THRESHOLDS.MAX_MEMORY_TOKENS + 1);
    expect(warnings.some((w) => w.code === 'OVERSIZED_MEMORY')).toBe(true);
  });
});

describe('detectMissingIgnoreFile', () => {
  it('returns a warning when .claudeignore is missing', () => {
    // Use a temp path that definitely has no .claudeignore
    const w = detectMissingIgnoreFile('/tmp/definitely-does-not-exist-claudectx-test');
    expect(w).not.toBeNull();
    expect(w!.code).toBe('MISSING_IGNOREFILE');
  });
});
