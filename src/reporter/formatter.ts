/**
 * Formats a ReportData object as plain text, JSON, or Markdown.
 */
import type { ReportData } from './usage-aggregator.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toLocaleString();
}

function fmtCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function fmtK(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}

function bar(value: number, max: number, width = 20): string {
  if (max === 0) return ' '.repeat(width);
  const filled = Math.round((value / max) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function shortPath(p: string): string {
  const parts = p.split('/');
  return parts.length > 3 ? '…/' + parts.slice(-3).join('/') : p;
}

// ─── Plain text ───────────────────────────────────────────────────────────────

export function formatText(data: ReportData): string {
  const lines: string[] = [];

  lines.push(
    `claudectx report — ${data.periodDays}-day summary (${data.startDate} → ${data.endDate})`
  );
  lines.push('═'.repeat(70));
  lines.push('');

  // Summary table
  lines.push('TOTALS');
  lines.push('─'.repeat(40));
  lines.push(`  Sessions:              ${fmtNum(data.totalSessions)}`);
  lines.push(`  Requests:              ${fmtNum(data.totalRequests)}`);
  lines.push(`  Input tokens:          ${fmtNum(data.totalInputTokens)}`);
  lines.push(`  Output tokens:         ${fmtNum(data.totalOutputTokens)}`);
  lines.push(`  Cache reads:           ${fmtNum(data.totalCacheReadTokens)}  (${data.cacheHitRate}% hit rate)`);
  lines.push(`  Total cost (est.):     ${fmtCost(data.totalCostUsd)}`);
  lines.push(`  Avg cost/session:      ${fmtCost(data.avgCostPerSession)}`);
  lines.push(`  Avg tokens/request:    ${fmtNum(data.avgTokensPerRequest)}`);
  lines.push(`  Model:                 ${data.model}`);
  lines.push('');

  // Daily breakdown (spark-bar chart)
  const activeDays = data.byDay.filter((d) => d.sessions > 0);
  if (activeDays.length > 0) {
    lines.push('DAILY USAGE');
    lines.push('─'.repeat(40));
    const maxTokens = Math.max(...activeDays.map((d) => d.inputTokens), 1);
    for (const day of data.byDay) {
      if (day.sessions === 0) continue;
      const b = bar(day.inputTokens, maxTokens, 18);
      lines.push(
        `  ${day.date}  ${b}  ${fmtK(day.inputTokens)} in  ${fmtCost(day.costUsd)}  (${day.sessions} sess)`
      );
    }
    lines.push('');
  }

  // Top files
  if (data.topFiles.length > 0) {
    lines.push('TOP FILES READ');
    lines.push('─'.repeat(40));
    const maxReads = Math.max(...data.topFiles.map((f) => f.readCount), 1);
    for (let i = 0; i < data.topFiles.length; i++) {
      const f = data.topFiles[i];
      const b = bar(f.readCount, maxReads, 12);
      lines.push(`  ${String(i + 1).padStart(2)}.  ${b}  ×${f.readCount}  ${shortPath(f.filePath)}`);
    }
    lines.push('');
  } else {
    lines.push('  No file-read data. Install hooks: claudectx optimize --hooks');
    lines.push('');
  }

  // Optimisation tips
  const tips: string[] = [];
  if (data.cacheHitRate < 30 && data.totalRequests > 5) {
    tips.push('Cache hit rate is low — run `claudectx optimize --cache` to fix dynamic content.');
  }
  if (data.avgTokensPerRequest > 10_000) {
    tips.push('High tokens/request — run `claudectx optimize --claudemd` to split your CLAUDE.md.');
  }
  if (data.topFiles.length === 0) {
    tips.push('Install hooks to track file reads: `claudectx optimize --hooks`.');
  }

  if (tips.length > 0) {
    lines.push('OPTIMISATION TIPS');
    lines.push('─'.repeat(40));
    tips.forEach((t) => lines.push(`  ⚡ ${t}`));
    lines.push('');
  }

  lines.push(`Generated at: ${data.generatedAt}`);

  return lines.join('\n');
}

// ─── JSON ─────────────────────────────────────────────────────────────────────

export function formatJSON(data: ReportData): string {
  return JSON.stringify(data, null, 2);
}

// ─── Markdown ─────────────────────────────────────────────────────────────────

export function formatMarkdown(data: ReportData): string {
  const lines: string[] = [];

  lines.push(`# claudectx Report`);
  lines.push('');
  lines.push(`**Period:** ${data.startDate} → ${data.endDate} (${data.periodDays} days)`);
  lines.push(`**Generated:** ${new Date(data.generatedAt).toLocaleString()}`);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Sessions | ${fmtNum(data.totalSessions)} |`);
  lines.push(`| Requests | ${fmtNum(data.totalRequests)} |`);
  lines.push(`| Input tokens | ${fmtNum(data.totalInputTokens)} |`);
  lines.push(`| Output tokens | ${fmtNum(data.totalOutputTokens)} |`);
  lines.push(`| Cache hit rate | ${data.cacheHitRate}% |`);
  lines.push(`| Total cost (est.) | ${fmtCost(data.totalCostUsd)} |`);
  lines.push(`| Avg cost/session | ${fmtCost(data.avgCostPerSession)} |`);
  lines.push(`| Avg tokens/request | ${fmtNum(data.avgTokensPerRequest)} |`);
  lines.push(`| Model | \`${data.model}\` |`);
  lines.push('');

  const activeDays = data.byDay.filter((d) => d.sessions > 0);
  if (activeDays.length > 0) {
    lines.push('## Daily Breakdown');
    lines.push('');
    lines.push('| Date | Sessions | Input tokens | Cost |');
    lines.push('|------|----------|-------------|------|');
    for (const day of activeDays) {
      lines.push(
        `| ${day.date} | ${day.sessions} | ${fmtK(day.inputTokens)} | ${fmtCost(day.costUsd)} |`
      );
    }
    lines.push('');
  }

  if (data.topFiles.length > 0) {
    lines.push('## Top Files Read');
    lines.push('');
    lines.push('| # | File | Reads |');
    lines.push('|---|------|-------|');
    data.topFiles.forEach((f, i) => {
      lines.push(`| ${i + 1} | \`${shortPath(f.filePath)}\` | ${f.readCount} |`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export function format(
  data: ReportData,
  mode: 'text' | 'json' | 'markdown'
): string {
  switch (mode) {
    case 'json':
      return formatJSON(data);
    case 'markdown':
      return formatMarkdown(data);
    default:
      return formatText(data);
  }
}
