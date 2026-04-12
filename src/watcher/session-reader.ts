/**
 * Reads Claude Code session JSONL files to extract token usage.
 *
 * Session files live at:
 *   ~/.claude/projects/<path-with-slashes-as-dashes>/<session-uuid>.jsonl
 *
 * Each line is one of:
 *   {"type":"user",      "message": {...}}
 *   {"type":"assistant", "message": {"role":"assistant","content":[...],"usage":{...}}}
 *   {"type":"summary",   ...}
 *
 * The `usage` object on assistant messages mirrors the Anthropic API:
 *   input_tokens, output_tokens,
 *   cache_creation_input_tokens, cache_read_input_tokens
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface SessionTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  requestCount: number;
}

export interface SessionFileMeta {
  filePath: string;
  mtimeMs: number;
  sessionId: string;
  projectDir: string;
}

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

/**
 * List all session JSONL files across all projects, sorted newest-first.
 */
export function listSessionFiles(): SessionFileMeta[] {
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return [];

  const results: SessionFileMeta[] = [];

  try {
    const projectDirs = fs.readdirSync(CLAUDE_PROJECTS_DIR);
    for (const projectDir of projectDirs) {
      const projectPath = path.join(CLAUDE_PROJECTS_DIR, projectDir);
      try {
        const stat = fs.statSync(projectPath);
        if (!stat.isDirectory()) continue;

        const files = fs.readdirSync(projectPath).filter((f) => f.endsWith('.jsonl'));
        for (const file of files) {
          const filePath = path.join(projectPath, file);
          try {
            const fstat = fs.statSync(filePath);
            results.push({
              filePath,
              mtimeMs: fstat.mtimeMs,
              sessionId: path.basename(file, '.jsonl'),
              projectDir,
            });
          } catch {
            // skip unreadable files
          }
        }
      } catch {
        // skip unreadable dirs
      }
    }
  } catch {
    return [];
  }

  return results.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/**
 * Return the path to the most recently modified session JSONL file,
 * optionally filtered to the given session ID.
 */
export function findSessionFile(sessionId?: string): string | null {
  const files = listSessionFiles();
  if (files.length === 0) return null;

  if (sessionId) {
    const match = files.find((f) => f.sessionId === sessionId);
    return match?.filePath ?? null;
  }

  return files[0]?.filePath ?? null;
}

/**
 * Parse a session JSONL file and aggregate token usage across all requests.
 * Streams line-by-line to avoid loading large files entirely into memory.
 * Gracefully skips malformed lines.
 */
export async function readSessionUsage(sessionFilePath: string): Promise<SessionTokenUsage> {
  const result: SessionTokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    requestCount: 0,
  };

  if (!fs.existsSync(sessionFilePath)) return result;

  const { createReadStream } = await import('fs');
  const { createInterface } = await import('readline');

  try {
    const rl = createInterface({
      input: createReadStream(sessionFilePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as Record<string, unknown>;

        // Support both top-level usage and nested message.usage
        const usage =
          (entry.usage as Record<string, number> | undefined) ??
          ((entry.message as Record<string, unknown> | undefined)?.usage as
            | Record<string, number>
            | undefined);

        if (!usage) continue;

        const isAssistant =
          entry.type === 'assistant' ||
          (entry.message as Record<string, unknown> | undefined)?.role === 'assistant';

        if (isAssistant) {
          result.inputTokens += usage.input_tokens ?? 0;
          result.outputTokens += usage.output_tokens ?? 0;
          result.cacheCreationTokens += usage.cache_creation_input_tokens ?? 0;
          result.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
          result.requestCount++;
        }
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    return result;
  }

  return result;
}

/**
 * Derive a human-readable project name from the project directory name
 * (e.g. "-Users-alice-code-myapp" → "myapp").
 */
export function projectNameFromDir(projectDir: string): string {
  const parts = projectDir.split('-').filter(Boolean);
  return parts[parts.length - 1] ?? projectDir;
}
