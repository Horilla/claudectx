/**
 * Aggregates token usage and file-read data across multiple sessions
 * for the `claudectx report` command.
 */
import { listSessionFiles, readSessionUsage } from '../watcher/session-reader.js';
import { readAllEvents, aggregateStats } from '../watcher/session-store.js';
import { MODEL_PRICING } from '../shared/models.js';
import type { ClaudeModel } from '../shared/types.js';

export interface DayBucket {
  date: string; // YYYY-MM-DD
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  requests: number;
  costUsd: number;
}

export interface ReportData {
  periodDays: number;
  startDate: string;
  endDate: string;
  totalSessions: number;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  cacheHitRate: number; // 0-100
  totalCostUsd: number;
  avgCostPerSession: number;
  avgTokensPerRequest: number;
  byDay: DayBucket[];
  topFiles: Array<{ filePath: string; readCount: number }>;
  model: ClaudeModel;
  generatedAt: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function calcCost(inputTokens: number, outputTokens: number, model: ClaudeModel): number {
  const p = MODEL_PRICING[model];
  return (inputTokens / 1e6) * p.inputPerMillion + (outputTokens / 1e6) * p.outputPerMillion;
}

/**
 * Aggregate session data for the last `days` days.
 */
export async function aggregateUsage(
  days: number,
  model: ClaudeModel = 'claude-sonnet-4-6'
): Promise<ReportData> {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffMs = cutoff.getTime();

  // ── Session JSONL data ──────────────────────────────────────────────────────

  const sessionFiles = listSessionFiles().filter((f) => f.mtimeMs >= cutoffMs);

  const bucketMap = new Map<string, DayBucket>();

  // Initialise one bucket per day in the range
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = isoDate(d);
    bucketMap.set(dateStr, {
      date: dateStr,
      sessions: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      requests: 0,
      costUsd: 0,
    });
  }

  let totalRequests = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;

  for (const sf of sessionFiles) {
    const dateStr = isoDate(new Date(sf.mtimeMs));
    const bucket = bucketMap.get(dateStr);
    if (!bucket) continue;

    const usage = readSessionUsage(sf.filePath);
    bucket.sessions++;
    bucket.inputTokens += usage.inputTokens;
    bucket.outputTokens += usage.outputTokens;
    bucket.cacheReadTokens += usage.cacheReadTokens;
    bucket.requests += usage.requestCount;
    bucket.costUsd += calcCost(usage.inputTokens, usage.outputTokens, model);

    totalInput += usage.inputTokens;
    totalOutput += usage.outputTokens;
    totalCacheRead += usage.cacheReadTokens;
    totalRequests += usage.requestCount;
  }

  // ── File-read stats ─────────────────────────────────────────────────────────

  const fileEvents = readAllEvents().filter(
    (e) => new Date(e.timestamp).getTime() >= cutoffMs
  );
  const fileStats = aggregateStats(fileEvents);
  const topFiles = fileStats.slice(0, 10).map((s) => ({
    filePath: s.filePath,
    readCount: s.readCount,
  }));

  // ── Totals ──────────────────────────────────────────────────────────────────

  const totalCost = calcCost(totalInput, totalOutput, model);
  const cacheHitRate =
    totalInput > 0 ? Math.round((totalCacheRead / totalInput) * 100) : 0;

  const byDay = [...bucketMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  // Scan actual unique sessions count from file list
  const uniqueSessions = new Set(sessionFiles.map((f) => f.sessionId)).size;

  return {
    periodDays: days,
    startDate: isoDate(cutoff),
    endDate: isoDate(now),
    totalSessions: uniqueSessions,
    totalRequests,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalCacheReadTokens: totalCacheRead,
    cacheHitRate,
    totalCostUsd: totalCost,
    avgCostPerSession: uniqueSessions > 0 ? totalCost / uniqueSessions : 0,
    avgTokensPerRequest: totalRequests > 0 ? Math.round(totalInput / totalRequests) : 0,
    byDay,
    topFiles,
    model,
    generatedAt: now.toISOString(),
  };
}
