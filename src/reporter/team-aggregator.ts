import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as childProcess from 'child_process';
import { listSessionFiles, readSessionUsage } from '../watcher/session-reader.js';
import { readAllEvents, aggregateStats, getStoreDir } from '../watcher/session-store.js';
import { MODEL_PRICING } from '../shared/models.js';
import type { ClaudeModel } from '../shared/types.js';
import type { DayBucket } from './usage-aggregator.js';

export interface DeveloperRecord {
  identity: string;
  exportedAt: string;
  periodDays: number;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  cacheHitRate: number;
  avgRequestSize: number;
  topWasteFiles: Array<{ filePath: string; readCount: number }>;
  sessionCount: number;
}

export interface TeamExport {
  version: '1';
  developer: DeveloperRecord;
  byDay: DayBucket[];
}

export interface TeamReport {
  generatedAt: string;
  totalDevelopers: number;
  periodDays: number;
  developers: DeveloperRecord[];
  teamTotalCostUsd: number;
  teamCacheHitRate: number;
  topWasteFiles: Array<{ filePath: string; readCount: number; developers: string[] }>;
}

/**
 * Get a stable developer identity: git email, falling back to hostname.
 */
export function getDeveloperIdentity(): string {
  try {
    const email = childProcess
      .execSync('git config user.email', { encoding: 'utf-8', timeout: 2000, stdio: ['pipe', 'pipe', 'pipe'] })
      .trim();
    if (email) return email;
  } catch {
    // Not a git repo or git not installed
  }
  return os.hostname();
}

function calcCost(inputTokens: number, outputTokens: number, model: ClaudeModel): number {
  const p = MODEL_PRICING[model];
  return (inputTokens / 1e6) * p.inputPerMillion + (outputTokens / 1e6) * p.outputPerMillion;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Anonymize a developer export by replacing identity with "Dev N".
 */
export function anonymizeExport(report: TeamExport, index: number): TeamExport {
  return {
    ...report,
    developer: {
      ...report.developer,
      identity: `Dev ${index + 1}`,
    },
  };
}

/**
 * Build a team export from the current developer's local session data.
 */
export async function buildTeamExport(
  days: number,
  model: ClaudeModel,
  anonymize: boolean,
): Promise<TeamExport> {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffMs = cutoff.getTime();

  const sessionFiles = listSessionFiles().filter((f) => f.mtimeMs >= cutoffMs);

  // Per-day buckets
  const bucketMap = new Map<string, DayBucket>();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = isoDate(d);
    bucketMap.set(dateStr, {
      date: dateStr, sessions: 0, inputTokens: 0, outputTokens: 0,
      cacheReadTokens: 0, requests: 0, costUsd: 0,
    });
  }

  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalRequests = 0;

  for (const sf of sessionFiles) {
    const dateStr = isoDate(new Date(sf.mtimeMs));
    const bucket = bucketMap.get(dateStr);
    const usage = readSessionUsage(sf.filePath);

    if (bucket) {
      bucket.sessions++;
      bucket.inputTokens += usage.inputTokens;
      bucket.outputTokens += usage.outputTokens;
      bucket.cacheReadTokens += usage.cacheReadTokens;
      bucket.requests += usage.requestCount;
      bucket.costUsd += calcCost(usage.inputTokens, usage.outputTokens, model);
    }

    totalInput += usage.inputTokens;
    totalOutput += usage.outputTokens;
    totalCacheRead += usage.cacheReadTokens;
    totalRequests += usage.requestCount;
  }

  const fileEvents = readAllEvents().filter(
    (e) => new Date(e.timestamp).getTime() >= cutoffMs,
  );
  const topWasteFiles = aggregateStats(fileEvents)
    .slice(0, 10)
    .map((s) => ({ filePath: s.filePath, readCount: s.readCount }));

  const totalCostUsd = calcCost(totalInput, totalOutput, model);
  const cacheHitRate = totalInput > 0 ? Math.round((totalCacheRead / totalInput) * 100) : 0;
  const uniqueSessions = new Set(sessionFiles.map((f) => f.sessionId)).size;

  const developer: DeveloperRecord = {
    identity: getDeveloperIdentity(),
    exportedAt: now.toISOString(),
    periodDays: days,
    totalCostUsd,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    cacheHitRate,
    avgRequestSize: totalRequests > 0 ? Math.round(totalInput / totalRequests) : 0,
    topWasteFiles,
    sessionCount: uniqueSessions,
  };

  const byDay = [...bucketMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  const exportData: TeamExport = { version: '1', developer, byDay };

  if (anonymize) return anonymizeExport(exportData, 0);
  return exportData;
}

/**
 * Merge multiple developer exports into a consolidated team report.
 */
export function aggregateTeamReports(exports: TeamExport[]): TeamReport {
  const developers = exports.map((e) => e.developer);
  // Sort by cost descending
  developers.sort((a, b) => b.totalCostUsd - a.totalCostUsd);

  const teamTotalCostUsd = developers.reduce((sum, d) => sum + d.totalCostUsd, 0);
  const teamCacheHitRate =
    developers.length > 0
      ? Math.round(developers.reduce((sum, d) => sum + d.cacheHitRate, 0) / developers.length)
      : 0;

  // Merge top waste files across developers
  const fileMap = new Map<string, { readCount: number; developers: string[] }>();
  for (const dev of developers) {
    for (const wf of dev.topWasteFiles) {
      const existing = fileMap.get(wf.filePath);
      if (existing) {
        existing.readCount += wf.readCount;
        existing.developers.push(dev.identity);
      } else {
        fileMap.set(wf.filePath, { readCount: wf.readCount, developers: [dev.identity] });
      }
    }
  }

  const topWasteFiles = [...fileMap.entries()]
    .map(([filePath, data]) => ({ filePath, ...data }))
    .sort((a, b) => b.readCount - a.readCount)
    .slice(0, 10);

  const periodDays = exports[0]?.developer.periodDays ?? 30;

  return {
    generatedAt: new Date().toISOString(),
    totalDevelopers: exports.length,
    periodDays,
    developers,
    teamTotalCostUsd,
    teamCacheHitRate,
    topWasteFiles,
  };
}

/** Write a team export to ~/.claudectx/team-export-{date}.json */
export function writeTeamExport(exportData: TeamExport): string {
  const storeDir = getStoreDir();
  if (!fs.existsSync(storeDir)) fs.mkdirSync(storeDir, { recursive: true });
  const date = isoDate(new Date());
  const filePath = path.join(storeDir, `team-export-${date}.json`);
  fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf-8');
  return filePath;
}

/** Read all team-export-*.json files from a directory */
export function readTeamExports(dir: string): TeamExport[] {
  const exports: TeamExport[] = [];
  if (!fs.existsSync(dir)) return exports;
  const files = fs.readdirSync(dir).filter((f) => f.match(/^team-export-.*\.json$/));
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
      exports.push(JSON.parse(raw) as TeamExport);
    } catch {
      // Skip malformed files
    }
  }
  return exports;
}
