import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { countTokens } from './tokenizer.js';
import { tokenCost, formatCost } from './cost-calculator.js';
import { readAllEvents } from '../watcher/session-store.js';
import type { ClaudeModel } from '../shared/types.js';
import { WASTE_THRESHOLDS } from '../shared/constants.js';

export interface FileTokenEntry {
  filePath: string;
  tokenCount: number;
  recentReadCount: number;
  cacheHitLikelihood: 'high' | 'medium' | 'low';
  estimatedCostUsd: number;
}

export interface BudgetReport {
  globs: string[];
  model: ClaudeModel;
  files: FileTokenEntry[];
  totalTokens: number;
  totalEstimatedCostUsd: number;
  thresholdExceeded: boolean;
  thresholdTokens: number;
  cacheHitPotential: number; // 0-100, weighted % of tokens likely to cache-hit
  claudeignoreRecommendations: string[];
}

/**
 * Resolve glob patterns to matching file paths within projectRoot.
 */
export function resolveGlobs(globs: string[], projectRoot: string): string[] {
  const results: string[] = [];
  for (const pattern of globs) {
    try {
      const matches = glob.sync(pattern, {
        cwd: projectRoot,
        absolute: true,
        nodir: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/*.min.js'],
      });
      results.push(...matches);
    } catch {
      // Skip invalid patterns
    }
  }
  // Deduplicate
  return [...new Set(results)];
}

/**
 * Classify cache hit likelihood based on how many times the file was read recently.
 */
export function classifyCacheHit(recentReadCount: number): 'high' | 'medium' | 'low' {
  if (recentReadCount >= 3) return 'high';
  if (recentReadCount >= 1) return 'medium';
  return 'low';
}

/**
 * Suggest files that should be added to .claudeignore (large files not already ignored).
 */
export function suggestClaudeignoreAdditions(
  files: FileTokenEntry[],
  projectRoot: string,
): string[] {
  const ignorePath = path.join(projectRoot, '.claudeignore');
  let ignorePatterns: string[] = [];
  try {
    const content = fs.readFileSync(ignorePath, 'utf-8');
    ignorePatterns = content.split('\n').filter(Boolean);
  } catch {
    // No .claudeignore — all large files are candidates
  }

  const recommendations: string[] = [];
  for (const file of files) {
    if (file.tokenCount <= WASTE_THRESHOLDS.MAX_REFERENCE_FILE_TOKENS) continue;

    const rel = path.relative(projectRoot, file.filePath);
    // Check if already covered by an existing ignore pattern
    const alreadyIgnored = ignorePatterns.some((pattern) => {
      const cleanPattern = pattern.replace(/^!/, '');
      return rel.startsWith(cleanPattern.replace(/\*/g, '').replace(/\//g, path.sep));
    });

    if (!alreadyIgnored) {
      recommendations.push(rel);
    }
  }
  return recommendations;
}

/**
 * Estimate token budget for the given file globs.
 */
export async function estimateBudget(
  globs: string[],
  projectRoot: string,
  model: ClaudeModel,
  thresholdTokens: number,
): Promise<BudgetReport> {
  // Resolve globs to file paths
  const filePaths = resolveGlobs(globs, projectRoot);

  // Build recent read count map from reads.jsonl
  const events = readAllEvents();
  const readCounts = new Map<string, number>();
  for (const event of events) {
    const count = readCounts.get(event.filePath) ?? 0;
    readCounts.set(event.filePath, count + 1);
  }

  // Build per-file entries
  const files: FileTokenEntry[] = [];
  for (const filePath of filePaths) {
    let content = '';
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }

    const tokenCount = countTokens(content);
    const recentReadCount = readCounts.get(filePath) ?? 0;
    const cacheHitLikelihood = classifyCacheHit(recentReadCount);
    const estimatedCostUsd = tokenCost(tokenCount, model);

    files.push({
      filePath,
      tokenCount,
      recentReadCount,
      cacheHitLikelihood,
      estimatedCostUsd,
    });
  }

  // Sort by token count descending
  files.sort((a, b) => b.tokenCount - a.tokenCount);

  const totalTokens = files.reduce((sum, f) => sum + f.tokenCount, 0);
  const totalEstimatedCostUsd = tokenCost(totalTokens, model);

  // Cache hit potential: weighted average
  // high = 0.85, medium = 0.50, low = 0.0
  const CACHE_WEIGHTS = { high: 0.85, medium: 0.5, low: 0 };
  let weightedSum = 0;
  for (const f of files) {
    weightedSum += f.tokenCount * CACHE_WEIGHTS[f.cacheHitLikelihood];
  }
  const cacheHitPotential = totalTokens > 0 ? Math.round((weightedSum / totalTokens) * 100) : 0;

  const claudeignoreRecommendations = suggestClaudeignoreAdditions(files, projectRoot);

  return {
    globs,
    model,
    files,
    totalTokens,
    totalEstimatedCostUsd,
    thresholdExceeded: totalTokens > thresholdTokens,
    thresholdTokens,
    cacheHitPotential,
    claudeignoreRecommendations,
  };
}

/** Format a budget report as a human-readable string */
export function formatBudgetReport(report: BudgetReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('claudectx budget — context cost estimate');
  lines.push('═'.repeat(50));

  if (report.files.length === 0) {
    lines.push('No files matched the given glob patterns.');
    return lines.join('\n');
  }

  // File table
  const LIKELIHOOD_ICON = { high: '🟢', medium: '🟡', low: '🔴' };
  const maxPathLen = Math.min(
    Math.max(...report.files.map((f) => path.basename(f.filePath).length)),
    40,
  );

  lines.push(
    `  ${'File'.padEnd(maxPathLen)}  ${'Tokens'.padStart(7)}  Cache    Cost`,
  );
  lines.push('─'.repeat(50));

  for (const file of report.files.slice(0, 20)) {
    const name = path.basename(file.filePath).slice(0, maxPathLen).padEnd(maxPathLen);
    const tokens = file.tokenCount.toLocaleString().padStart(7);
    const cache = `${LIKELIHOOD_ICON[file.cacheHitLikelihood]} ${file.cacheHitLikelihood.padEnd(6)}`;
    const cost = formatCost(file.estimatedCostUsd).padStart(7);
    lines.push(`  ${name}  ${tokens}  ${cache}  ${cost}`);
  }
  if (report.files.length > 20) {
    lines.push(`  ... and ${report.files.length - 20} more files`);
  }

  lines.push('─'.repeat(50));

  const thresholdStatus = report.thresholdExceeded
    ? `⚠  EXCEEDS threshold (${report.thresholdTokens.toLocaleString()} tokens)`
    : `✓  Within threshold (${report.thresholdTokens.toLocaleString()} tokens)`;

  lines.push(`  Total tokens:     ${report.totalTokens.toLocaleString().padStart(10)}`);
  lines.push(`  Estimated cost:   ${formatCost(report.totalEstimatedCostUsd).padStart(10)}`);
  lines.push(`  Cache potential:  ${`${report.cacheHitPotential}%`.padStart(10)}`);
  lines.push(`  ${thresholdStatus}`);

  if (report.claudeignoreRecommendations.length > 0) {
    lines.push('');
    lines.push('  💡 Add to .claudeignore to exclude large files:');
    for (const rec of report.claudeignoreRecommendations.slice(0, 5)) {
      lines.push(`     ${rec}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}
