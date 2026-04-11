/**
 * Summarises a parsed session into a compact MEMORY.md entry.
 *
 * Strategy:
 *  1. If ANTHROPIC_API_KEY is available → call claude-haiku-4-5 for a tight summary
 *  2. Otherwise → build a structured summary from the parsed session metadata
 */
import type { ParsedSession } from './session-parser.js';
import { getApiKey } from '../shared/config.js';
import { MODEL_PRICING } from '../shared/models.js';

export interface SummaryResult {
  text: string;
  method: 'ai' | 'heuristic';
  model?: string;
  inputTokens?: number;
}

const SUMMARY_MODEL = 'claude-haiku-4-5-20251001';
const SUMMARY_MAX_TOKENS = 300;

const SYSTEM_PROMPT = `You are a session-compressor for Claude Code.
Your job is to produce a concise MEMORY.md entry (max 200 words) for a coding session.

Focus on:
- What was built or fixed (specific function/file names)
- Key decisions or patterns established
- Any gotchas or critical context for future sessions

Output ONLY the entry body — no frontmatter, no headings, no preamble.
Use bullet points. Be terse. Prioritise facts over narrative.`;

// ─── AI summarisation ─────────────────────────────────────────────────────────

export async function summariseWithAI(
  conversationText: string,
  apiKey?: string
): Promise<SummaryResult> {
  const key = apiKey ?? getApiKey();
  if (!key) {
    throw new Error('No API key available');
  }

  // Lazy import so the SDK is only loaded when actually needed
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key });

  const response = await client.messages.create({
    model: SUMMARY_MODEL,
    max_tokens: SUMMARY_MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Summarise this Claude Code session:\n\n${conversationText}`,
      },
    ],
  });

  const text =
    response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('\n')
      .trim() || '(no summary generated)';

  return {
    text,
    method: 'ai',
    model: SUMMARY_MODEL,
    inputTokens: response.usage.input_tokens,
  };
}

// ─── Heuristic fallback ───────────────────────────────────────────────────────

export function summariseHeuristically(session: ParsedSession): SummaryResult {
  const lines: string[] = [];

  // First user message = the task description
  const firstUser = session.turns.find((t) => t.role === 'user' && t.text);
  if (firstUser?.text) {
    const brief = firstUser.text.split('\n')[0].slice(0, 200);
    lines.push(`- **Task:** ${brief}`);
  }

  // Files touched
  if (session.filesCreated.length > 0) {
    lines.push(`- **Created:** ${session.filesCreated.map(shortPath).join(', ')}`);
  }
  if (session.filesEdited.length > 0) {
    const edited = session.filesEdited.slice(0, 8).map(shortPath).join(', ');
    lines.push(`- **Edited:** ${edited}${session.filesEdited.length > 8 ? ' …' : ''}`);
  }
  if (session.filesRead.length > 0) {
    lines.push(`- **Read ${session.filesRead.length} file(s)**`);
  }

  // Key commands
  const notable = session.commandsRun
    .filter((c) => !c.startsWith('echo') && !c.startsWith('cat'))
    .slice(0, 3);
  if (notable.length > 0) {
    lines.push(`- **Commands:** ${notable.map((c) => `\`${c.slice(0, 60)}\``).join(', ')}`);
  }

  // Token stats
  const totalIn = session.totalUsage.inputTokens;
  const totalOut = session.totalUsage.outputTokens;
  const cost = calcCost(totalIn, totalOut);
  lines.push(
    `- **Stats:** ${session.turnCount} requests, ${fmt(totalIn)}↓ / ${fmt(totalOut)}↑ tokens, ~$${cost}`
  );

  return {
    text: lines.join('\n') || '- (No session content extracted)',
    method: 'heuristic',
  };
}

// ─── High-level entry point ───────────────────────────────────────────────────

export async function summariseSession(
  session: ParsedSession,
  conversationText: string,
  apiKey?: string
): Promise<SummaryResult> {
  const key = apiKey ?? getApiKey();
  if (key) {
    try {
      return await summariseWithAI(conversationText, key);
    } catch {
      // Fall through to heuristic
    }
  }
  return summariseHeuristically(session);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortPath(p: string): string {
  const parts = p.split('/');
  return parts.slice(-2).join('/');
}

function fmt(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}

function calcCost(inputTokens: number, outputTokens: number): string {
  const p = MODEL_PRICING['claude-sonnet-4-6'];
  const cost = (inputTokens / 1e6) * p.inputPerMillion + (outputTokens / 1e6) * p.outputPerMillion;
  return cost.toFixed(3);
}
