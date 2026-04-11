import type { ClaudeModel, ModelPricing } from './types.js';

/** Per-million token pricing for all Claude models (USD) */
export const MODEL_PRICING: Record<ClaudeModel, ModelPricing> = {
  'claude-haiku-4-5': {
    inputPerMillion: 1.0,
    outputPerMillion: 5.0,
    cacheReadPerMillion: 0.1,
    cacheWritePerMillion: 1.25,
    contextWindow: 200_000,
  },
  'claude-sonnet-4-6': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheReadPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
    contextWindow: 1_000_000,
  },
  'claude-opus-4-6': {
    inputPerMillion: 5.0,
    outputPerMillion: 25.0,
    cacheReadPerMillion: 0.5,
    cacheWritePerMillion: 6.25,
    contextWindow: 1_000_000,
  },
};

export const DEFAULT_MODEL: ClaudeModel = 'claude-sonnet-4-6';

export const MODEL_ALIASES: Record<string, ClaudeModel> = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
  'claude-haiku': 'claude-haiku-4-5',
  'claude-sonnet': 'claude-sonnet-4-6',
  'claude-opus': 'claude-opus-4-6',
};

/** Resolve a model alias or full name to a ClaudeModel key */
export function resolveModel(input: string): ClaudeModel {
  const lower = input.toLowerCase();
  if (lower in MODEL_ALIASES) return MODEL_ALIASES[lower];
  if (lower in MODEL_PRICING) return lower as ClaudeModel;
  return DEFAULT_MODEL;
}

/** Calculate cost for a given token count and model */
export function calculateCost(tokens: number, model: ClaudeModel): number {
  if (tokens === 0) return 0;
  return (tokens / 1_000_000) * MODEL_PRICING[model].inputPerMillion;
}
