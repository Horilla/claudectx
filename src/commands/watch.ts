import * as path from 'path';
import { appendFileRead } from '../watcher/session-store.js';
import { resolveModel } from '../shared/models.js';
import type { ClaudeModel } from '../shared/types.js';

interface WatchOptions {
  session?: string;
  logStdin?: boolean;
  model?: string;
  clear?: boolean;
}

/**
 * Hook payload sent via stdin when PostToolUse fires.
 * Claude Code passes: { tool_name, tool_input, tool_response, session_id }
 */
interface HookPayload {
  tool_name?: string;
  tool_input?: { file_path?: string };
  session_id?: string;
}

export async function watchCommand(options: WatchOptions): Promise<void> {
  // ── Hook mode ────────────────────────────────────────────────────────────
  // Called by the Claude Code PostToolUse hook via:
  //   echo "$HOOK_JSON" | claudectx watch --log-stdin
  if (options.logStdin) {
    await handleLogStdin();
    return;
  }

  // ── Clear mode ───────────────────────────────────────────────────────────
  if (options.clear) {
    const { clearStore } = await import('../watcher/session-store.js');
    clearStore();
    process.stdout.write('claudectx: session store cleared.\n');
    return;
  }

  // ── Dashboard mode ───────────────────────────────────────────────────────
  // Check that we're in an interactive terminal
  if (!process.stdout.isTTY) {
    process.stderr.write(
      'claudectx watch: stdout is not a TTY — dashboard requires an interactive terminal.\n'
    );
    process.exit(1);
  }

  const model = (options.model ? resolveModel(options.model) : 'claude-sonnet-4-6') as ClaudeModel;

  const { render } = await import('ink');
  const React = (await import('react')).default;
  const { Dashboard } = await import('../components/Dashboard.js');

  render(
    React.createElement(Dashboard, {
      model,
      sessionId: options.session,
    })
  );
}

/** Read stdin, parse JSON hook payload, log the file path. */
async function handleLogStdin(): Promise<void> {
  const raw = await readStdin();
  if (!raw.trim()) return;

  try {
    const payload = JSON.parse(raw) as HookPayload;
    const filePath = payload.tool_input?.file_path;
    if (filePath) {
      appendFileRead(path.resolve(filePath), payload.session_id);
    }
  } catch {
    // Malformed JSON — ignore, don't crash the hook
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    // Safety timeout — if stdin never closes (not piped), resolve empty
    setTimeout(() => resolve(data), 500);
  });
}
