/**
 * claudectx revert — list and restore automatic backups.
 *
 * Every claudectx command that modifies files creates a backup first.
 * This command lets you see those backups and restore any of them.
 *
 * Usage:
 *   claudectx revert --list              # show all backups
 *   claudectx revert --id <id>           # restore a specific backup
 *   claudectx revert --file CLAUDE.md    # show backups for one file
 *   claudectx revert                     # interactive: pick from list
 */
import * as path from 'path';
import {
  listBackups,
  restoreBackup,
  BACKUP_DIR,
  type BackupEntry,
} from '../shared/backup-manager.js';

export interface RevertOptions {
  list?: boolean;
  id?: string;
  file?: string;
  json?: boolean;
}

/** Format a relative time string (e.g. "2 hours ago") from an ISO timestamp. */
function timeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}

function printBackupTable(entries: BackupEntry[]): void {
  if (entries.length === 0) {
    process.stdout.write('  No backups found.\n');
    process.stdout.write(`  Backups are created automatically when claudectx modifies your files.\n`);
    process.stdout.write(`  Backup directory: ${BACKUP_DIR}\n\n`);
    return;
  }

  const idWidth = 26;
  const fileWidth = 20;
  const cmdWidth = 10;
  const timeWidth = 14;
  const sizeWidth = 7;

  const hr = '═'.repeat(idWidth + fileWidth + cmdWidth + timeWidth + sizeWidth + 16);

  process.stdout.write('\n');
  process.stdout.write('claudectx — Backup History\n');
  process.stdout.write(hr + '\n');
  process.stdout.write(
    `  ${'ID'.padEnd(idWidth)}  ${'File'.padEnd(fileWidth)}  ${'Command'.padEnd(cmdWidth)}  ${'When'.padEnd(timeWidth)}  ${'Size'.padEnd(sizeWidth)}\n`,
  );
  process.stdout.write('─'.repeat(idWidth + fileWidth + cmdWidth + timeWidth + sizeWidth + 16) + '\n');

  for (const entry of entries) {
    const id = entry.id.slice(0, idWidth).padEnd(idWidth);
    const file = path.basename(entry.originalPath).slice(0, fileWidth).padEnd(fileWidth);
    const cmd = entry.command.slice(0, cmdWidth).padEnd(cmdWidth);
    const when = timeAgo(entry.createdAt).slice(0, timeWidth).padEnd(timeWidth);
    const size = formatBytes(entry.sizeBytes).padEnd(sizeWidth);
    process.stdout.write(`  ${id}  ${file}  ${cmd}  ${when}  ${size}\n`);
  }

  process.stdout.write('\n');
  process.stdout.write(`  Backup directory: ${BACKUP_DIR}\n`);
  process.stdout.write('  To restore: claudectx revert --id <ID>\n\n');
}

async function interactivePick(entries: BackupEntry[]): Promise<string | null> {
  try {
    const { select } = await import('@inquirer/prompts');
    const choices = entries.map((e) => ({
      name: `${timeAgo(e.createdAt).padEnd(14)}  ${path.basename(e.originalPath).padEnd(16)}  [${e.command}]  ${e.id}`,
      value: e.id,
    }));
    choices.push({ name: 'Cancel', value: '' });
    return await select({ message: 'Choose a backup to restore:', choices });
  } catch {
    process.stderr.write('Interactive mode unavailable. Use --id <id> to restore a specific backup.\n');
    return null;
  }
}

async function doRestore(id: string): Promise<void> {
  const chalk = (await import('chalk')).default;

  process.stdout.write('\n');
  try {
    // Show which file will be affected
    const entries = await listBackups();
    const entry = entries.find((e) => e.id === id);
    if (!entry) {
      process.stderr.write(chalk.red(`Backup "${id}" not found.\n`));
      process.stderr.write('Run "claudectx revert --list" to see available backups.\n');
      process.exitCode = 1;
      return;
    }

    process.stdout.write(chalk.yellow(`⚠  This will overwrite: ${entry.originalPath}\n`));
    process.stdout.write(`   Backup from: ${timeAgo(entry.createdAt)} (${entry.command})\n`);
    process.stdout.write(`   Your current file will be backed up first (so you can undo this).\n\n`);

    // Confirm before restoring
    let confirmed = true;
    try {
      const { confirm } = await import('@inquirer/prompts');
      confirmed = await confirm({ message: 'Restore this backup?', default: false });
    } catch {
      // Non-interactive — proceed (e.g. piped script usage)
    }

    if (!confirmed) {
      process.stdout.write('  Cancelled.\n\n');
      return;
    }

    const { undoEntry } = await restoreBackup(id);

    process.stdout.write(chalk.green('  ✓ ') + `Restored to ${entry.originalPath}\n`);
    if (undoEntry) {
      process.stdout.write(
        chalk.dim(`  Your previous version was saved as backup "${undoEntry.id}" — run 'claudectx revert --id ${undoEntry.id}' to undo.\n`),
      );
    }
    process.stdout.write('\n');
  } catch (err) {
    process.stderr.write(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}\n`));
    process.exitCode = 1;
  }
}

export async function revertCommand(options: RevertOptions): Promise<void> {
  const entries = await listBackups(options.file);

  // ── JSON output ─────────────────────────────────────────────────────────────
  if (options.json) {
    process.stdout.write(JSON.stringify({ backups: entries }, null, 2) + '\n');
    return;
  }

  // ── --list: show table and exit ──────────────────────────────────────────────
  if (options.list) {
    printBackupTable(entries);
    return;
  }

  // ── --id: restore specific backup ───────────────────────────────────────────
  if (options.id) {
    await doRestore(options.id);
    return;
  }

  // ── No args: interactive ─────────────────────────────────────────────────────
  if (entries.length === 0) {
    process.stdout.write('\n  No backups found. Backups are created automatically when claudectx modifies your files.\n\n');
    return;
  }

  printBackupTable(entries);
  const picked = await interactivePick(entries);
  if (picked) {
    await doRestore(picked);
  }
}
