/**
 * claudectx report — print a usage analytics report for the last N days.
 *
 * Usage:
 *   claudectx report            # 7-day text report
 *   claudectx report --days 30  # 30-day window
 *   claudectx report --json     # machine-readable JSON
 *   claudectx report --markdown # GitHub-flavoured Markdown
 *   claudectx report --model opus
 */
import type { ClaudeModel } from '../shared/types.js';
import { aggregateUsage } from '../reporter/usage-aggregator.js';
import { format } from '../reporter/formatter.js';

export interface ReportOptions {
  days?: string;
  json?: boolean;
  markdown?: boolean;
  model?: string;
  path?: string;
}

const MODEL_ALIASES: Record<string, ClaudeModel> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
  'claude-haiku-4-5-20251001': 'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6': 'claude-sonnet-4-6',
  'claude-opus-4-6': 'claude-opus-4-6',
};

export async function reportCommand(options: ReportOptions): Promise<void> {
  const days = Math.max(1, parseInt(options.days ?? '7', 10));

  const modelAlias = options.model ?? 'sonnet';
  const model: ClaudeModel = MODEL_ALIASES[modelAlias] ?? 'claude-sonnet-4-6';

  const mode = options.json ? 'json' : options.markdown ? 'markdown' : 'text';

  const data = await aggregateUsage(days, model);
  const output = format(data, mode);

  process.stdout.write(output + '\n');
}
