import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import {
  getDeveloperIdentity,
  anonymizeExport,
  aggregateTeamReports,
  buildTeamExport,
} from '../../../src/reporter/team-aggregator.js';
import type { TeamExport } from '../../../src/reporter/team-aggregator.js';

// Redirect store dir to a temp directory
vi.mock('os', async () => {
  const actual = await vi.importActual<typeof os>('os');
  return {
    ...actual,
    homedir: () => process.env['TEST_HOME'] ?? actual.homedir(),
  };
});

let tmpDir: string;
let origHome: string | undefined;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claudectx-teams-'));
  origHome = process.env['TEST_HOME'];
  process.env['TEST_HOME'] = tmpDir;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (origHome === undefined) {
    delete process.env['TEST_HOME'];
  } else {
    process.env['TEST_HOME'] = origHome;
  }
  vi.restoreAllMocks();
});

function makeExport(identity: string, costUsd: number, wasteFile?: string): TeamExport {
  return {
    version: '1',
    developer: {
      identity,
      exportedAt: new Date().toISOString(),
      periodDays: 30,
      totalCostUsd: costUsd,
      totalInputTokens: 100000,
      totalOutputTokens: 20000,
      cacheHitRate: 40,
      avgRequestSize: 1000,
      topWasteFiles: wasteFile ? [{ filePath: wasteFile, readCount: 5 }] : [],
      sessionCount: 10,
    },
    byDay: [],
  };
}

describe('getDeveloperIdentity', () => {
  it('returns a non-empty string', () => {
    const identity = getDeveloperIdentity();
    expect(typeof identity).toBe('string');
    expect(identity.length).toBeGreaterThan(0);
  });
});

describe('anonymizeExport', () => {
  it('replaces identity with "Dev 1" for index 0', () => {
    const original = makeExport('alice@example.com', 1.5);
    const anon = anonymizeExport(original, 0);
    expect(anon.developer.identity).toBe('Dev 1');
  });

  it('replaces identity with "Dev 3" for index 2', () => {
    const original = makeExport('bob@example.com', 2.0);
    const anon = anonymizeExport(original, 2);
    expect(anon.developer.identity).toBe('Dev 3');
  });

  it('does not mutate the original export', () => {
    const original = makeExport('alice@example.com', 1.5);
    anonymizeExport(original, 0);
    expect(original.developer.identity).toBe('alice@example.com');
  });
});

describe('aggregateTeamReports', () => {
  it('correctly sums teamTotalCostUsd from two exports', () => {
    const exports = [makeExport('alice@example.com', 2.5), makeExport('bob@example.com', 1.5)];
    const report = aggregateTeamReports(exports);
    expect(report.teamTotalCostUsd).toBeCloseTo(4.0);
  });

  it('sets totalDevelopers correctly', () => {
    const exports = [makeExport('alice@example.com', 1.0), makeExport('bob@example.com', 2.0)];
    const report = aggregateTeamReports(exports);
    expect(report.totalDevelopers).toBe(2);
  });

  it('includes both developer names in topWasteFiles for a shared file', () => {
    const sharedFile = '/repo/src/expensive.ts';
    const exports = [
      makeExport('alice@example.com', 1.0, sharedFile),
      makeExport('bob@example.com', 2.0, sharedFile),
    ];
    const report = aggregateTeamReports(exports);
    const entry = report.topWasteFiles.find((f) => f.filePath === sharedFile);
    expect(entry).toBeDefined();
    expect(entry!.developers).toContain('alice@example.com');
    expect(entry!.developers).toContain('bob@example.com');
  });

  it('sorts developers by totalCostUsd descending', () => {
    const exports = [makeExport('cheap@example.com', 0.5), makeExport('pricey@example.com', 5.0)];
    const report = aggregateTeamReports(exports);
    expect(report.developers[0].identity).toBe('pricey@example.com');
  });

  it('returns empty report for empty input', () => {
    const report = aggregateTeamReports([]);
    expect(report.totalDevelopers).toBe(0);
    expect(report.teamTotalCostUsd).toBe(0);
    expect(report.developers).toHaveLength(0);
  });
});

describe('buildTeamExport', () => {
  it('produces version "1" with developer.identity field', async () => {
    // No real session files in the tmp dir, so counts will be zero — that's fine
    const result = await buildTeamExport(7, 'claude-sonnet-4-6', false);
    expect(result.version).toBe('1');
    expect(typeof result.developer.identity).toBe('string');
    expect(result.developer.identity.length).toBeGreaterThan(0);
  });

  it('produces byDay array with the correct number of entries', async () => {
    const days = 7;
    const result = await buildTeamExport(days, 'claude-sonnet-4-6', false);
    expect(result.byDay).toHaveLength(days);
  });

  it('anonymizes identity when anonymize=true', async () => {
    const result = await buildTeamExport(7, 'claude-sonnet-4-6', true);
    expect(result.developer.identity).toBe('Dev 1');
  });
});
