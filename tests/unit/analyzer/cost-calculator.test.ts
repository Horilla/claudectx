import { describe, it, expect } from 'vitest';
import { tokenCost, sessionCost, calculatePotentialSavings, formatCost } from '../../../src/analyzer/cost-calculator.js';
import { MODEL_PRICING } from '../../../src/shared/models.js';
import { SESSION_DEFAULTS } from '../../../src/shared/constants.js';

describe('tokenCost', () => {
  it('returns 0 for 0 tokens', () => {
    expect(tokenCost(0, 'claude-sonnet-4-6')).toBe(0);
    expect(tokenCost(0, 'claude-haiku-4-5')).toBe(0);
    expect(tokenCost(0, 'claude-opus-4-6')).toBe(0);
  });

  it('calculates correctly for sonnet', () => {
    // 1M tokens at $3/M = $3.00
    const cost = tokenCost(1_000_000, 'claude-sonnet-4-6');
    expect(cost).toBeCloseTo(3.0, 2);
  });

  it('calculates correctly for haiku (cheapest)', () => {
    // 1M tokens at $1/M = $1.00
    const cost = tokenCost(1_000_000, 'claude-haiku-4-5');
    expect(cost).toBeCloseTo(1.0, 2);
  });

  it('calculates correctly for opus (most expensive)', () => {
    // 1M tokens at $5/M = $5.00
    const cost = tokenCost(1_000_000, 'claude-opus-4-6');
    expect(cost).toBeCloseTo(5.0, 2);
  });

  it('cache read cost is 10% of base input cost for all models', () => {
    for (const [, pricing] of Object.entries(MODEL_PRICING)) {
      const ratio = pricing.cacheReadPerMillion / pricing.inputPerMillion;
      expect(ratio).toBeCloseTo(0.1, 1);
    }
  });
});

describe('sessionCost', () => {
  it('multiplies per-request cost by session request count', () => {
    const costs = sessionCost(10_000, 'claude-sonnet-4-6');
    const expectedPerReq = (10_000 / 1_000_000) * 3.0;
    expect(costs.perRequest).toBeCloseTo(expectedPerReq, 5);
    expect(costs.perSession).toBeCloseTo(expectedPerReq * SESSION_DEFAULTS.REQUESTS_PER_SESSION, 5);
  });
});

describe('calculatePotentialSavings', () => {
  it('calculates savings correctly', () => {
    const result = calculatePotentialSavings(10_000, 5_000, 'claude-sonnet-4-6');
    expect(result.savedTokens).toBe(5_000);
    expect(result.savedPercent).toBe(50);
    expect(result.savedCostPerSession).toBeGreaterThan(0);
  });

  it('caps savings at current token count', () => {
    const result = calculatePotentialSavings(1_000, 9_999, 'claude-sonnet-4-6');
    expect(result.savedTokens).toBe(1_000);
    expect(result.savedPercent).toBe(100);
  });

  it('returns 0 percent when no savings', () => {
    const result = calculatePotentialSavings(0, 0, 'claude-sonnet-4-6');
    expect(result.savedPercent).toBe(0);
  });
});

describe('formatCost', () => {
  it('formats zero as $0.00', () => {
    expect(formatCost(0)).toBe('$0.00');
  });

  it('formats small values correctly', () => {
    expect(formatCost(0.001)).toBe('$0.00');
    expect(formatCost(0.01)).toBe('$0.01');
    expect(formatCost(1.234)).toBe('$1.23');
  });
});
