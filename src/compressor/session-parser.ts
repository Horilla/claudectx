/**
 * Parses a Claude Code session JSONL file into structured, human-readable
 * content suitable for summarisation.
 */
import * as fs from 'fs';

export interface SessionTurn {
  role: 'user' | 'assistant';
  text: string; // extracted plain text
  toolCalls: ToolCall[];
  usage?: { inputTokens: number; outputTokens: number };
}

export interface ToolCall {
  tool: string;
  input: Record<string, unknown>;
}

export interface ParsedSession {
  sessionId: string;
  filePath: string;
  turns: SessionTurn[];
  totalUsage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
  filesRead: string[];
  filesEdited: string[];
  filesCreated: string[];
  commandsRun: string[];
  turnCount: number;
}

// ─── Raw JSONL types ──────────────────────────────────────────────────────────

interface RawUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
}

interface RawContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string | RawContentBlock[];
}

interface RawMessage {
  role?: string;
  content?: string | RawContentBlock[];
  usage?: RawUsage;
}

interface RawEntry {
  type?: string;
  message?: RawMessage;
  usage?: RawUsage;
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

function extractText(content: string | RawContentBlock[] | undefined): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text!)
    .join('\n')
    .trim();
}

function extractToolCalls(content: string | RawContentBlock[] | undefined): ToolCall[] {
  if (!content || typeof content === 'string') return [];
  return content
    .filter((b) => b.type === 'tool_use' && b.name)
    .map((b) => ({ tool: b.name!, input: b.input ?? {} }));
}

export function parseSessionFile(sessionFilePath: string): ParsedSession | null {
  if (!fs.existsSync(sessionFilePath)) return null;

  let content: string;
  try {
    content = fs.readFileSync(sessionFilePath, 'utf-8');
  } catch {
    return null;
  }

  const lines = content.trim().split('\n').filter(Boolean);
  const turns: SessionTurn[] = [];
  const totalUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as RawEntry;
      const msg = entry.message;
      if (!msg) continue;

      const role = msg.role === 'user' ? 'user' : msg.role === 'assistant' ? 'assistant' : null;
      if (!role) continue;

      const usage = msg.usage ?? entry.usage;
      if (usage) {
        totalUsage.inputTokens += usage.input_tokens ?? 0;
        totalUsage.outputTokens += usage.output_tokens ?? 0;
        totalUsage.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
      }

      turns.push({
        role,
        text: extractText(msg.content),
        toolCalls: extractToolCalls(msg.content),
        usage: usage
          ? { inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0 }
          : undefined,
      });
    } catch {
      // skip malformed lines
    }
  }

  // Derive file lists from tool calls
  const filesRead = new Set<string>();
  const filesEdited = new Set<string>();
  const filesCreated = new Set<string>();
  const commandsRun: string[] = [];

  for (const turn of turns) {
    for (const tc of turn.toolCalls) {
      const fp = (tc.input.file_path ?? tc.input.path ?? tc.input.file) as string | undefined;
      switch (tc.tool) {
        case 'Read':
          if (fp) filesRead.add(fp);
          break;
        case 'Edit':
        case 'MultiEdit':
          if (fp) filesEdited.add(fp);
          break;
        case 'Write':
          if (fp) filesCreated.add(fp);
          break;
        case 'Bash': {
          const cmd = tc.input.command as string | undefined;
          if (cmd) commandsRun.push(cmd.slice(0, 120));
          break;
        }
      }
    }
  }

  const sessionId = sessionFilePath.replace(/^.*[\\/]/, '').replace('.jsonl', '');

  return {
    sessionId,
    filePath: sessionFilePath,
    turns,
    totalUsage,
    filesRead: [...filesRead],
    filesEdited: [...filesEdited],
    filesCreated: [...filesCreated],
    commandsRun,
    turnCount: turns.filter((t) => t.role === 'user').length,
  };
}

/**
 * Build a condensed text representation of the session suitable for the
 * Claude summarisation prompt. Keeps the most important context.
 */
export function buildConversationText(session: ParsedSession, maxChars = 20_000): string {
  const parts: string[] = [];

  // Include up to the last 10 user/assistant exchanges
  const relevantTurns = session.turns.slice(-20);
  for (const turn of relevantTurns) {
    if (!turn.text && turn.toolCalls.length === 0) continue;

    const label = turn.role === 'user' ? 'USER' : 'ASSISTANT';
    const text = turn.text ? turn.text.slice(0, 800) : '';
    const tools =
      turn.toolCalls.length > 0
        ? `[tools: ${turn.toolCalls.map((t) => t.tool).join(', ')}]`
        : '';

    parts.push(`${label}: ${text} ${tools}`.trim());
  }

  const body = parts.join('\n\n');
  return body.length > maxChars ? body.slice(0, maxChars) + '\n…(truncated)' : body;
}
