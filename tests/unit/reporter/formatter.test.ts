import { describe, it, expect } from 'vitest';
import { formatText, formatJSON, formatMarkdown, format } from '../../../src/reporter/formatter.js';
import type { ReportData } from '../../../src/reporter/usage-aggregator.js';

function makeData(overrides: Partial<ReportData> = {}): ReportData {
  return {
    periodDays: 7,
    startDate: '2026-04-04',
    endDate: '2026-04-11',
    totalSessions: 5,
    totalRequests: 42,
    totalInputTokens: 85_000,
    totalOutputTokens: 12_000,
    totalCacheReadTokens: 30_000,
    cacheHitRate: 35,
    totalCostUsd: 0.42,
    avgCostPerSession: 0.084,
    avgTokensPerRequest: 2023,
    byDay: [
      {
        date: '2026-04-11',
        sessions: 2,
        inputTokens: 40_000,
        outputTokens: 6_000,
        cacheReadTokens: 15_000,
        requests: 20,
        costUsd: 0.21,
      },
      {
        date: '2026-04-10',
        sessions: 3,
        inputTokens: 45_000,
        outputTokens: 6_000,
        cacheReadTokens: 15_000,
        requests: 22,
        costUsd: 0.21,
      },
    ],
    topFiles: [
      { filePath: '/home/user/project/src/components/App.tsx', readCount: 12 },
      { filePath: '/home/user/project/src/utils/helpers.ts', readCount: 7 },
    ],
    model: 'claude-sonnet-4-6',
    generatedAt: '2026-04-11T12:00:00.000Z',
    ...overrides,
  };
}

// ─── formatText ───────────────────────────────────────────────────────────────

describe('formatText', () => {
  it('contains TOTALS section', () => {
    const text = formatText(makeData());
    expect(text).toContain('TOTALS');
    expect(text).toContain('Sessions:');
    expect(text).toContain('Requests:');
  });

  it('renders total cost', () => {
    const text = formatText(makeData({ totalCostUsd: 1.23 }));
    expect(text).toContain('$1.23');
  });

  it('renders daily usage section for active days', () => {
    const text = formatText(makeData());
    expect(text).toContain('DAILY USAGE');
    expect(text).toContain('2026-04-11');
  });

  it('renders top files section', () => {
    const text = formatText(makeData());
    expect(text).toContain('TOP FILES READ');
    expect(text).toContain('App.tsx');
  });

  it('skips days with zero sessions', () => {
    const data = makeData();
    data.byDay.push({
      date: '2026-04-09',
      sessions: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      requests: 0,
      costUsd: 0,
    });
    const text = formatText(data);
    expect(text).not.toContain('2026-04-09');
  });

  it('shows optimisation tip when cache hit rate is low', () => {
    const text = formatText(makeData({ cacheHitRate: 10, totalRequests: 20 }));
    expect(text).toContain('OPTIMISATION TIPS');
    expect(text).toContain('cache');
  });

  it('shows optimisation tip when no file data', () => {
    const text = formatText(makeData({ topFiles: [] }));
    expect(text).toContain('Install hooks');
  });

  it('shows tip when tokens/request is very high', () => {
    const text = formatText(makeData({ avgTokensPerRequest: 15_000 }));
    expect(text).toContain('claudemd');
  });

  it('shows install hooks message when topFiles is empty', () => {
    const text = formatText(makeData({ topFiles: [] }));
    expect(text).toContain('claudectx optimize --hooks');
  });

  it('uses fmtCost with 4 decimal places for tiny amounts', () => {
    const text = formatText(makeData({ totalCostUsd: 0.0042 }));
    expect(text).toContain('$0.0042');
  });
});

// ─── formatJSON ───────────────────────────────────────────────────────────────

describe('formatJSON', () => {
  it('returns valid JSON', () => {
    const json = formatJSON(makeData());
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('round-trips the model field', () => {
    const data = makeData();
    const parsed = JSON.parse(formatJSON(data));
    expect(parsed.model).toBe('claude-sonnet-4-6');
  });

  it('includes all top-level keys', () => {
    const parsed = JSON.parse(formatJSON(makeData()));
    expect(parsed).toHaveProperty('totalSessions');
    expect(parsed).toHaveProperty('byDay');
    expect(parsed).toHaveProperty('topFiles');
  });
});

// ─── formatMarkdown ───────────────────────────────────────────────────────────

describe('formatMarkdown', () => {
  it('starts with an H1 heading', () => {
    const md = formatMarkdown(makeData());
    expect(md.trimStart()).toMatch(/^# claudectx Report/);
  });

  it('contains a Summary table', () => {
    const md = formatMarkdown(makeData());
    expect(md).toContain('## Summary');
    expect(md).toContain('| Sessions |');
    expect(md).toContain('| Total cost (est.) |');
  });

  it('contains the daily breakdown table', () => {
    const md = formatMarkdown(makeData());
    expect(md).toContain('## Daily Breakdown');
    expect(md).toContain('| Date |');
    expect(md).toContain('2026-04-11');
  });

  it('contains the top files table', () => {
    const md = formatMarkdown(makeData());
    expect(md).toContain('## Top Files Read');
    expect(md).toContain('App.tsx');
  });

  it('omits daily breakdown when no active days', () => {
    const data = makeData({ byDay: [] });
    const md = formatMarkdown(data);
    expect(md).not.toContain('## Daily Breakdown');
  });

  it('omits top files section when topFiles is empty', () => {
    const data = makeData({ topFiles: [] });
    const md = formatMarkdown(data);
    expect(md).not.toContain('## Top Files Read');
  });
});

// ─── format dispatcher ────────────────────────────────────────────────────────

describe('format', () => {
  it('dispatches json mode', () => {
    const result = format(makeData(), 'json');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('dispatches markdown mode', () => {
    const result = format(makeData(), 'markdown');
    expect(result).toContain('# claudectx Report');
  });

  it('defaults to text mode', () => {
    const result = format(makeData(), 'text');
    expect(result).toContain('TOTALS');
  });
});
