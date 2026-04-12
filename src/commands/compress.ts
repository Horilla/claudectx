/**
 * claudectx compress — compress the most recent (or specified) Claude Code
 * session into a compact MEMORY.md entry.
 *
 * Usage:
 *   claudectx compress                    # compress most recent session
 *   claudectx compress --session <id>     # compress specific session
 *   claudectx compress --auto             # non-interactive (for hooks)
 *   claudectx compress --prune --days 30  # also prune old entries
 *   claudectx compress --path ./proj      # project directory
 *   claudectx compress --api-key <key>    # use AI summarization
 */
import * as path from 'path';
import * as fs from 'fs';
import { listSessionFiles } from '../watcher/session-reader.js';
import { parseSessionFile, buildConversationText } from '../compressor/session-parser.js';
import { summariseSession } from '../compressor/summarizer.js';
import {
  appendEntry,
  pruneOldEntries,
  isAlreadyCompressed,
} from '../compressor/memory-writer.js';
import { getApiKey } from '../shared/config.js';
import { backupFile } from '../shared/backup-manager.js';

export interface CompressOptions {
  session?: string;
  auto?: boolean;
  path?: string;
  prune?: boolean;
  days?: string;
  apiKey?: string;
}

export async function compressCommand(options: CompressOptions): Promise<void> {
  const chalk = (await import('chalk')).default;
  const projectRoot = options.path ? path.resolve(options.path) : process.cwd();
  const memoryFilePath = path.join(projectRoot, 'MEMORY.md');

  // ── 1. Resolve session file ──────────────────────────────────────────────────

  const sessionFiles = listSessionFiles();
  if (sessionFiles.length === 0) {
    process.stdout.write(chalk.red('No Claude Code sessions found.\n'));
    process.stdout.write(chalk.dim('Sessions are stored in ~/.claude/projects/\n'));
    process.exitCode = 1;
    return;
  }

  let targetFile: string;

  if (options.session) {
    const match = sessionFiles.find(
      (f) => f.sessionId === options.session || f.sessionId.startsWith(options.session!)
    );
    if (!match) {
      process.stdout.write(chalk.red(`Session not found: ${options.session}\n`));
      process.stdout.write(chalk.dim(`Available: ${sessionFiles.slice(0, 5).map((f) => f.sessionId).join(', ')}\n`));
      process.exitCode = 1;
      return;
    }
    targetFile = match.filePath;
  } else {
    // Most recent session (already sorted by mtime desc)
    targetFile = sessionFiles[0].filePath;
  }

  const sessionId = path.basename(targetFile, '.jsonl');

  // ── 2. Deduplication check ───────────────────────────────────────────────────

  if (isAlreadyCompressed(memoryFilePath, sessionId)) {
    if (!options.auto) {
      process.stdout.write(chalk.yellow(`Session ${sessionId.slice(0, 8)}… is already in MEMORY.md — skipping.\n`));
    }
    return;
  }

  // ── 3. Parse session ─────────────────────────────────────────────────────────

  const parsed = parseSessionFile(targetFile);
  if (!parsed) {
    process.stdout.write(chalk.red(`Failed to parse session file: ${targetFile}\n`));
    process.exitCode = 1;
    return;
  }

  if (!options.auto) {
    process.stdout.write(
      chalk.cyan(`Compressing session ${chalk.bold(sessionId.slice(0, 8))}… `) +
        chalk.dim(`(${parsed.turnCount} turns, ${parsed.filesEdited.length} files edited)\n`)
    );
  }

  // ── 4. Summarize ─────────────────────────────────────────────────────────────

  const conversationText = buildConversationText(parsed);
  const apiKey = options.apiKey ?? getApiKey();

  let spinner: ReturnType<typeof setInterval> | null = null;
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frameIdx = 0;

  if (!options.auto && apiKey) {
    process.stdout.write(chalk.dim('Summarizing with AI… '));
    spinner = setInterval(() => {
      process.stdout.write(`\r${chalk.dim('Summarizing with AI… ')}${frames[frameIdx++ % frames.length]}`);
    }, 80);
  }

  const result = await summariseSession(parsed, conversationText, apiKey ?? undefined);

  if (spinner) {
    clearInterval(spinner);
    process.stdout.write('\r' + ' '.repeat(40) + '\r');
  }

  // ── 5. Append to MEMORY.md ───────────────────────────────────────────────────

  appendEntry(memoryFilePath, sessionId, result.text);

  if (!options.auto) {
    const methodLabel =
      result.method === 'ai'
        ? chalk.green(`AI (${result.model}, ${result.inputTokens} tokens)`)
        : chalk.yellow('heuristic (no API key)');

    process.stdout.write(chalk.green('✓') + ` Appended to ${chalk.bold(memoryFilePath)} via ${methodLabel}\n`);
    process.stdout.write('\n' + chalk.dim('─'.repeat(60)) + '\n');
    process.stdout.write(result.text + '\n');
    process.stdout.write(chalk.dim('─'.repeat(60)) + '\n');
  }

  // ── 6. Optional prune ────────────────────────────────────────────────────────

  if (options.prune) {
    const days = parseInt(options.days ?? '30', 10);
    if (!fs.existsSync(memoryFilePath)) return;

    // Confirm before silently deleting MEMORY.md entries (skip in --auto mode)
    if (!options.auto) {
      let confirmed = true;
      try {
        const { confirm } = await import('@inquirer/prompts');
        confirmed = await confirm({
          message: `Prune MEMORY.md entries older than ${days} days? Run 'claudectx revert' to undo.`,
          default: false,
        });
      } catch {
        // Non-interactive environment — proceed
      }
      if (!confirmed) {
        process.stdout.write(chalk.dim('Prune skipped.\n'));
        return;
      }
    }

    // Back up MEMORY.md before pruning
    await backupFile(memoryFilePath, 'compress');

    const pruned = pruneOldEntries(memoryFilePath, days);
    if (pruned.removed > 0 && !options.auto) {
      process.stdout.write(
        chalk.dim(`Pruned ${pruned.removed} entr${pruned.removed === 1 ? 'y' : 'ies'} older than ${days} days. Run 'claudectx revert' to undo.\n`)
      );
    }
  }
}
