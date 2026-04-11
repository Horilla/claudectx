import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  resolveGlobs,
  classifyCacheHit,
  estimateBudget,
  suggestClaudeignoreAdditions,
} from '../../../src/analyzer/budget-estimator.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claudectx-budget-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('resolveGlobs', () => {
  it('returns matching file paths for a valid glob', () => {
    // Create a few .ts files
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'foo.ts'), 'const x = 1;');
    fs.writeFileSync(path.join(tmpDir, 'src', 'bar.ts'), 'const y = 2;');

    const results = resolveGlobs(['src/**/*.ts'], tmpDir);
    expect(results.length).toBe(2);
    expect(results.every((r) => r.endsWith('.ts'))).toBe(true);
  });

  it('returns empty array for a glob that matches nothing', () => {
    const results = resolveGlobs(['nonexistent/**/*.xyz'], tmpDir);
    expect(results).toEqual([]);
  });

  it('deduplicates results when two patterns match the same file', () => {
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'export {};');

    const results = resolveGlobs(['src/**/*.ts', 'src/index.ts'], tmpDir);
    expect(results.length).toBe(1);
  });
});

describe('classifyCacheHit', () => {
  it('returns high for read count >= 3', () => {
    expect(classifyCacheHit(3)).toBe('high');
    expect(classifyCacheHit(10)).toBe('high');
  });

  it('returns medium for read count 1 or 2', () => {
    expect(classifyCacheHit(1)).toBe('medium');
    expect(classifyCacheHit(2)).toBe('medium');
  });

  it('returns low for read count 0', () => {
    expect(classifyCacheHit(0)).toBe('low');
  });
});

describe('estimateBudget', () => {
  it('returns positive totalTokens and cost for a small file', async () => {
    fs.writeFileSync(path.join(tmpDir, 'hello.ts'), 'const greeting = "hello world";');

    const report = await estimateBudget(['*.ts'], tmpDir, 'claude-sonnet-4-6', 10000);

    expect(report.totalTokens).toBeGreaterThan(0);
    expect(report.totalEstimatedCostUsd).toBeGreaterThan(0);
    expect(report.files.length).toBe(1);
  });

  it('sets thresholdExceeded to true when tokens exceed threshold', async () => {
    // Write a file that will definitely exceed a threshold of 1 token
    fs.writeFileSync(path.join(tmpDir, 'big.ts'), 'export const x = 1; '.repeat(100));

    const report = await estimateBudget(['*.ts'], tmpDir, 'claude-sonnet-4-6', 1);

    expect(report.thresholdExceeded).toBe(true);
  });

  it('sets thresholdExceeded to false when tokens are within threshold', async () => {
    fs.writeFileSync(path.join(tmpDir, 'tiny.ts'), 'x');

    const report = await estimateBudget(['*.ts'], tmpDir, 'claude-sonnet-4-6', 1_000_000);

    expect(report.thresholdExceeded).toBe(false);
  });

  it('returns empty files array when no files match the glob', async () => {
    const report = await estimateBudget(['**/*.nonexistent'], tmpDir, 'claude-sonnet-4-6', 10000);

    expect(report.files).toEqual([]);
    expect(report.totalTokens).toBe(0);
    expect(report.totalEstimatedCostUsd).toBe(0);
  });

  it('files are sorted by token count descending', async () => {
    fs.writeFileSync(path.join(tmpDir, 'small.ts'), 'x');
    fs.writeFileSync(path.join(tmpDir, 'large.ts'), 'export const value = 1; '.repeat(200));

    const report = await estimateBudget(['*.ts'], tmpDir, 'claude-sonnet-4-6', 10000);

    expect(report.files[0].tokenCount).toBeGreaterThanOrEqual(report.files[1]?.tokenCount ?? 0);
  });
});

describe('suggestClaudeignoreAdditions', () => {
  it('returns path of large file not in .claudeignore', () => {
    // Create a large file entry (mocking the tokenCount)
    const filePath = path.join(tmpDir, 'huge.ts');
    fs.writeFileSync(filePath, 'x');

    const files = [
      {
        filePath,
        tokenCount: 10000, // exceeds MAX_REFERENCE_FILE_TOKENS (5000)
        recentReadCount: 0,
        cacheHitLikelihood: 'low' as const,
        estimatedCostUsd: 0.01,
      },
    ];

    const suggestions = suggestClaudeignoreAdditions(files, tmpDir);
    expect(suggestions).toContain('huge.ts');
  });

  it('does not suggest small files', () => {
    const filePath = path.join(tmpDir, 'small.ts');
    fs.writeFileSync(filePath, 'x');

    const files = [
      {
        filePath,
        tokenCount: 100, // well under MAX_REFERENCE_FILE_TOKENS
        recentReadCount: 0,
        cacheHitLikelihood: 'low' as const,
        estimatedCostUsd: 0,
      },
    ];

    const suggestions = suggestClaudeignoreAdditions(files, tmpDir);
    expect(suggestions).toEqual([]);
  });
});
