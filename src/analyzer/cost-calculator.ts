import { MODEL_PRICING, calculateCost } from '../shared/models.js';
import { SESSION_DEFAULTS } from '../shared/constants.js';
import type { ClaudeModel } from '../shared/types.js';

export interface CostBreakdown {
  perRequest: number;
  perSession: number; // SESSION_DEFAULTS.REQUESTS_PER_SESSION requests
  perHour: number;    // 60 requests/hour estimate
}

/** Calculate cost for a given token count and model */
export function tokenCost(tokens: number, model: ClaudeModel): number {
  return calculateCost(tokens, model);
}

/** Calculate full session cost breakdown */
export function sessionCost(tokensPerRequest: number, model: ClaudeModel): CostBreakdown {
  const perRequest = calculateCost(tokensPerRequest, model);
  return {
    perRequest,
    perSession: perRequest * SESSION_DEFAULTS.REQUESTS_PER_SESSION,
    perHour: perRequest * 60,
  };
}

/** Calculate potential savings if all warnings are fixed */
export function calculatePotentialSavings(
  currentTokens: number,
  savableTokens: number,
  model: ClaudeModel,
): {
  savedTokens: number;
  savedPercent: number;
  savedCostPerSession: number;
} {
  const savedTokens = Math.min(savableTokens, currentTokens);
  const savedPercent = currentTokens > 0 ? Math.round((savedTokens / currentTokens) * 100) : 0;
  const savedCostPerSession =
    calculateCost(savedTokens, model) * SESSION_DEFAULTS.REQUESTS_PER_SESSION;

  return { savedTokens, savedPercent, savedCostPerSession };
}

/** Format cost as a dollar string */
export function formatCost(usd: number): string {
  if (usd < 0.01) return '$0.00';
  return `$${usd.toFixed(2)}`;
}

/** Format cost per model for comparison table */
export function allModelCosts(tokens: number): Record<ClaudeModel, number> {
  return Object.fromEntries(
    Object.keys(MODEL_PRICING).map((model) => [model, calculateCost(tokens, model as ClaudeModel)]),
  ) as Record<ClaudeModel, number>;
}
