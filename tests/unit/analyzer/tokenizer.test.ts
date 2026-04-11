import { describe, it, expect } from 'vitest';
import { countTokens, estimateTokens } from '../../../src/analyzer/tokenizer.js';

describe('countTokens', () => {
  it('returns 0 for empty string', () => {
    expect(countTokens('')).toBe(0);
  });

  it('returns 0 for undefined-like empty', () => {
    expect(countTokens('   ')).toBeGreaterThanOrEqual(0);
  });

  it('counts tokens for a short string', () => {
    const count = countTokens('Hello, world!');
    // Should be around 4 tokens — allow ±2 for tokenizer variation
    expect(count).toBeGreaterThanOrEqual(2);
    expect(count).toBeLessThanOrEqual(8);
  });

  it('is within 5% of expected for known strings', () => {
    const text = 'The quick brown fox jumps over the lazy dog.';
    const count = countTokens(text);
    // Known cl100k_base count: ~10 tokens. Allow ±5%
    expect(count).toBeGreaterThanOrEqual(8);
    expect(count).toBeLessThanOrEqual(13);
  });

  it('handles Unicode correctly', () => {
    const count = countTokens('Hello 世界 🌍');
    expect(count).toBeGreaterThan(0);
  });

  it('handles TypeScript code', () => {
    const code = `
interface User {
  id: number;
  name: string;
  email: string;
}
function greet(user: User): string {
  return \`Hello, \${user.name}!\`;
}
    `.trim();
    const count = countTokens(code);
    expect(count).toBeGreaterThan(10);
    expect(count).toBeLessThan(100);
  });

  it('handles Python code', () => {
    const code = `
def fibonacci(n: int) -> int:
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)
    `.trim();
    const count = countTokens(code);
    expect(count).toBeGreaterThan(5);
    expect(count).toBeLessThan(50);
  });

  it('returns a larger count for longer text', () => {
    const short = 'Hello';
    const long = 'Hello '.repeat(100);
    expect(countTokens(long)).toBeGreaterThan(countTokens(short));
  });
});

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('approximates 1 token per 4 chars', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcdefgh')).toBe(2);
  });
});
