import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { findProjectRoot } from '../analyzer/context-parser.js';
import { MODEL_PRICING, resolveModel } from '../shared/models.js';
import { formatCost } from '../analyzer/cost-calculator.js';
import type { ClaudeModel } from '../shared/types.js';
import fs from 'fs';

export interface WarmupOptions {
  path?: string;
  model?: string;
  ttl?: string;
  cron?: string;
  apiKey?: string;
  json?: boolean;
}

export interface WarmupResult {
  model: string;
  tokensWarmed: number;
  cacheWriteCostUsd: number;
  estimatedSavingsPerHit: number;
  breakEvenRequests: number;
  ttlMinutes: number;
  timestamp: string;
}

/**
 * Build the messages array for the warmup request.
 * The CLAUDE.md content is placed in the system block with cache_control.
 */
export function buildWarmupMessages(
  claudeMdContent: string,
): { system: Anthropic.TextBlockParam[]; messages: Anthropic.MessageParam[] } {
  const systemBlock: Anthropic.TextBlockParam = {
    type: 'text',
    text: claudeMdContent || '# Project\nNo CLAUDE.md found.',
    // @ts-expect-error — cache_control is valid but not yet in the TS types for all SDKs
    cache_control: { type: 'ephemeral' },
  };

  return {
    system: [systemBlock],
    messages: [
      {
        role: 'user',
        content: 'ping',
      },
    ],
  };
}

/**
 * Calculate how many cache reads needed to break even on the write cost.
 */
export function calculateBreakEven(
  writeTokens: number,
  model: ClaudeModel,
  ttlMinutes: 5 | 60,
): { breakEvenRequests: number; savingsPerHit: number; writeCostUsd: number } {
  const pricing = MODEL_PRICING[model];
  const writeMultiplier = ttlMinutes === 60 ? 2.0 : 1.25; // extended TTL costs 2x, standard is 1.25x
  const writeCostPerMillion = pricing.inputPerMillion * writeMultiplier;

  const writeCostUsd = (writeTokens / 1_000_000) * writeCostPerMillion;
  const readCostUsd = (writeTokens / 1_000_000) * pricing.cacheReadPerMillion;
  const inputCostUsd = (writeTokens / 1_000_000) * pricing.inputPerMillion;

  const savingsPerHit = inputCostUsd - readCostUsd;
  const breakEvenRequests = savingsPerHit > 0 ? Math.ceil(writeCostUsd / savingsPerHit) : 999;

  return { breakEvenRequests, savingsPerHit, writeCostUsd };
}

/**
 * Execute a warmup request. Accepts an injectable Anthropic client for testing.
 */
export async function executeWarmup(
  claudeMdContent: string,
  model: ClaudeModel,
  ttl: 5 | 60,
  client: Anthropic,
): Promise<WarmupResult> {
  const { system, messages } = buildWarmupMessages(claudeMdContent);

  const betas: string[] = ['prompt-caching-2024-07-31'];
  if (ttl === 60) betas.push('extended-cache-ttl-2025-02-19');

  const response = await client.beta.messages.create({
    model,
    max_tokens: 8,
    system,
    messages,
    betas,
  });

  const usage = response.usage as Record<string, number>;
  const tokensWarmed = usage.cache_creation_input_tokens ?? 0;

  const { breakEvenRequests, savingsPerHit, writeCostUsd } = calculateBreakEven(
    tokensWarmed,
    model,
    ttl,
  );

  return {
    model,
    tokensWarmed,
    cacheWriteCostUsd: writeCostUsd,
    estimatedSavingsPerHit: savingsPerHit,
    breakEvenRequests,
    ttlMinutes: ttl,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Install a cron job that runs `claudectx warmup` on a schedule.
 */
async function installCron(cronExpr: string, apiKey: string): Promise<void> {
  const { execSync } = await import('child_process');
  const command = `claudectx warmup --api-key ${apiKey}`;
  const cronLine = `${cronExpr} ${command}`;

  try {
    let existing = '';
    try {
      existing = execSync('crontab -l 2>/dev/null', { encoding: 'utf-8' });
    } catch {
      existing = '';
    }

    if (existing.includes('claudectx warmup')) {
      process.stdout.write('Cron job already installed for claudectx warmup.\n');
      return;
    }

    const newCrontab = existing.trimEnd() + '\n' + cronLine + '\n';
    execSync(`echo ${JSON.stringify(newCrontab)} | crontab -`);
    process.stdout.write(`✓ Cron job installed: ${cronLine}\n`);
  } catch {
    process.stdout.write(`Could not install cron automatically. Add manually:\n  ${cronLine}\n`);
  }
}

export async function warmupCommand(options: WarmupOptions): Promise<void> {
  const projectPath = options.path ? path.resolve(options.path) : process.cwd();
  const projectRoot = findProjectRoot(projectPath) ?? projectPath;
  const model = resolveModel(options.model ?? 'haiku');
  const ttl = (options.ttl === '60' ? 60 : 5) as 5 | 60;
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    process.stderr.write(
      'Error: Anthropic API key required. Use --api-key or set ANTHROPIC_API_KEY.\n',
    );
    process.exit(1);
  }

  // Read CLAUDE.md
  let claudeMdContent = '';
  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
  try {
    claudeMdContent = fs.readFileSync(claudeMdPath, 'utf-8');
  } catch {
    process.stderr.write(`Warning: No CLAUDE.md found at ${claudeMdPath}\n`);
  }

  const client = new Anthropic({ apiKey });

  if (!options.json) {
    process.stdout.write(`Warming up prompt cache (model: ${model}, TTL: ${ttl}min)...\n`);
  }

  let result: WarmupResult;
  try {
    result = await executeWarmup(claudeMdContent, model, ttl, client);
  } catch (err) {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  if (options.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return;
  }

  process.stdout.write('\n');
  process.stdout.write('claudectx warmup — prompt cache primed\n');
  process.stdout.write('═'.repeat(45) + '\n');
  process.stdout.write(`  Model:              ${result.model}\n`);
  process.stdout.write(`  Tokens warmed:      ${result.tokensWarmed.toLocaleString()}\n`);
  process.stdout.write(`  Cache write cost:   ${formatCost(result.cacheWriteCostUsd)}\n`);
  process.stdout.write(`  Savings per hit:    ${formatCost(result.estimatedSavingsPerHit)}\n`);
  process.stdout.write(`  Break-even after:   ${result.breakEvenRequests} requests\n`);
  process.stdout.write(`  TTL:                ${result.ttlMinutes} minutes\n`);
  process.stdout.write('\n');

  if (result.tokensWarmed === 0) {
    process.stdout.write(
      '  ⚠  No tokens were cached. CLAUDE.md may be below the minimum token threshold\n' +
        `     (${model === 'claude-haiku-4-5' ? '4,096' : '1,024'} tokens for ${model}).\n`,
    );
  } else {
    process.stdout.write(
      `  ✓  First ${result.ttlMinutes === 60 ? '60-minute' : '5-minute'} window of requests will benefit from cache hits.\n`,
    );
  }
  process.stdout.write('\n');

  if (options.cron) {
    await installCron(options.cron, apiKey);
  }
}
