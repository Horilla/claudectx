import { describe, it, expect, vi } from 'vitest';
import {
  buildWarmupMessages,
  calculateBreakEven,
  executeWarmup,
} from '../../../src/commands/warmup.js';

describe('buildWarmupMessages', () => {
  it('includes cache_control on the system block when content is non-empty', () => {
    const { system } = buildWarmupMessages('# Project\nSome instructions here.');
    expect(system).toHaveLength(1);
    expect((system[0] as Record<string, unknown>).cache_control).toEqual({ type: 'ephemeral' });
  });

  it('returns a valid system and messages array when content is empty', () => {
    const { system, messages } = buildWarmupMessages('');
    expect(system).toHaveLength(1);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
  });

  it('sets the system block text to the provided claudeMdContent', () => {
    const content = '# My Project\nStack: Django + React';
    const { system } = buildWarmupMessages(content);
    expect(system[0].text).toBe(content);
  });

  it('uses a fallback text when content is empty string', () => {
    const { system } = buildWarmupMessages('');
    expect(system[0].text).toContain('No CLAUDE.md');
  });
});

describe('calculateBreakEven', () => {
  it('returns breakEvenRequests >= 1 for haiku with 1000 write tokens (5-min TTL)', () => {
    const { breakEvenRequests } = calculateBreakEven(1000, 'claude-haiku-4-5', 5);
    // Write cost (1.25x input) / savings per hit (input - cacheRead): 1.25 / (1 - 0.1) ≈ 1.39 → ceil = 2
    expect(breakEvenRequests).toBeGreaterThanOrEqual(1);
  });

  it('returns a higher breakEven for 60-min TTL than 5-min TTL', () => {
    const standard = calculateBreakEven(5000, 'claude-sonnet-4-6', 5);
    const extended = calculateBreakEven(5000, 'claude-sonnet-4-6', 60);
    expect(extended.breakEvenRequests).toBeGreaterThan(standard.breakEvenRequests);
  });

  it('returns writeCostUsd > 0 for any positive token count', () => {
    const { writeCostUsd } = calculateBreakEven(500, 'claude-haiku-4-5', 5);
    expect(writeCostUsd).toBeGreaterThan(0);
  });

  it('savingsPerHit = inputCost - readCost > 0', () => {
    const { savingsPerHit } = calculateBreakEven(1000, 'claude-sonnet-4-6', 5);
    expect(savingsPerHit).toBeGreaterThan(0);
  });
});

describe('executeWarmup', () => {
  it('returns WarmupResult with tokensWarmed from cache_creation_input_tokens', async () => {
    const mockClient = {
      beta: {
        messages: {
          create: vi.fn().mockResolvedValue({
            usage: { cache_creation_input_tokens: 500, input_tokens: 0, output_tokens: 1 },
          }),
        },
      },
    };

    const result = await executeWarmup(
      '# My project\n'.repeat(50),
      'claude-haiku-4-5',
      5,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockClient as any,
    );

    expect(result.tokensWarmed).toBe(500);
    expect(result.model).toBe('claude-haiku-4-5');
    expect(result.ttlMinutes).toBe(5);
    expect(result.timestamp).toBeTruthy();
  });

  it('returns tokensWarmed = 0 when cache_creation_input_tokens is absent', async () => {
    const mockClient = {
      beta: {
        messages: {
          create: vi.fn().mockResolvedValue({
            usage: { input_tokens: 10, output_tokens: 1 },
          }),
        },
      },
    };

    const result = await executeWarmup(
      'short',
      'claude-haiku-4-5',
      5,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockClient as any,
    );

    expect(result.tokensWarmed).toBe(0);
  });

  it('calls the Anthropic client with the prompt-caching beta header', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      usage: { cache_creation_input_tokens: 100 },
    });
    const mockClient = { beta: { messages: { create: mockCreate } } };

    await executeWarmup(
      'content',
      'claude-haiku-4-5',
      5,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockClient as any,
    );

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.betas).toContain('prompt-caching-2024-07-31');
  });

  it('includes extended-cache-ttl beta when ttl is 60', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      usage: { cache_creation_input_tokens: 100 },
    });
    const mockClient = { beta: { messages: { create: mockCreate } } };

    await executeWarmup(
      'content',
      'claude-sonnet-4-6',
      60,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockClient as any,
    );

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.betas).toContain('extended-cache-ttl-2025-02-19');
  });
});
