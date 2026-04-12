/**
 * claudectx backup-manager — centralized backup utility for all file-modifying commands.
 *
 * Every command that modifies or overwrites a file calls backupFile() first.
 * Backups are stored in ~/.claudectx/backups/ with a manifest.json index.
 * The `claudectx revert` command reads the manifest to let users restore any backup.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BackupEntry {
  /** Unique ID, e.g. "2026-04-12T083012-CLAUDE.md" */
  id: string;
  /** Absolute path of the original file that was backed up */
  originalPath: string;
  /** Absolute path of the backup copy */
  backupPath: string;
  /** Which claudectx command triggered the backup */
  command: string;
  /** ISO 8601 timestamp */
  createdAt: string;
  /** Size of the backed-up file in bytes */
  sizeBytes: number;
}

export interface BackupManifest {
  version: '1';
  entries: BackupEntry[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum number of backups to keep before pruning oldest */
export const MAX_BACKUPS = 50;

// Internal override for tests — mutated only via setBackupDirForTesting().
let _backupDirOverride: string | null = null;

/**
 * Override the backup directory for tests.
 * Call in beforeEach with a temp dir; reset to null in afterEach.
 */
export function setBackupDirForTesting(dir: string | null): void {
  _backupDirOverride = dir;
}

/** Returns the active backup directory (respects test override). */
export function getBackupDir(): string {
  return _backupDirOverride ?? path.join(os.homedir(), '.claudectx', 'backups');
}

/**
 * The default backup directory path. Only use for display purposes.
 * Internally all code uses getBackupDir() to respect test overrides.
 */
export const BACKUP_DIR = path.join(os.homedir(), '.claudectx', 'backups');

// ─── Internal helpers ─────────────────────────────────────────────────────────

function ensureBackupDir(): void {
  const dir = getBackupDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getManifestPath(): string {
  return path.join(getBackupDir(), 'manifest.json');
}

function readManifest(): BackupManifest {
  ensureBackupDir();
  const manifestPath = getManifestPath();
  if (!fs.existsSync(manifestPath)) {
    return { version: '1', entries: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as BackupManifest;
  } catch {
    // Malformed manifest — start fresh (keep existing backup files)
    return { version: '1', entries: [] };
  }
}

/** Atomically write the manifest (temp file + rename) to prevent corruption. */
function writeManifest(manifest: BackupManifest): void {
  ensureBackupDir();
  const manifestPath = getManifestPath();
  const tmpPath = `${manifestPath}.tmp-${Date.now()}`;
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
    fs.renameSync(tmpPath, manifestPath);
  } catch {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    throw new Error(`Failed to write backup manifest at ${manifestPath}`);
  }
}

/** Generate a unique, filesystem-safe ID from a timestamp and filename. */
function generateId(originalPath: string): string {
  // Include milliseconds + random suffix to guarantee uniqueness even within the same second
  const now = new Date();
  const ts = now.toISOString()
    .replace(/[-:]/g, '')
    .replace('T', 'T')
    .replace('.', 'm')
    .replace('Z', '');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  const basename = path.basename(originalPath);
  return `${ts}-${rand}-${basename}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a backup of the given file before it is modified.
 *
 * @param filePath Absolute path of the file to back up.
 * @param command  The claudectx command triggering the backup (e.g. 'optimize').
 * @returns The BackupEntry describing where the backup was saved.
 * @throws If the source file does not exist or cannot be read.
 */
export async function backupFile(filePath: string, command: string): Promise<BackupEntry> {
  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Cannot back up "${resolved}": file does not exist.`);
  }

  ensureBackupDir();

  const id = generateId(resolved);
  const backupPath = path.join(getBackupDir(), id);

  fs.copyFileSync(resolved, backupPath);

  const stat = fs.statSync(backupPath);
  const entry: BackupEntry = {
    id,
    originalPath: resolved,
    backupPath,
    command,
    createdAt: new Date().toISOString(),
    sizeBytes: stat.size,
  };

  const manifest = readManifest();
  manifest.entries.unshift(entry); // newest first
  writeManifest(manifest);

  // Auto-prune if over limit
  if (manifest.entries.length > MAX_BACKUPS) {
    await pruneOldBackups();
  }

  return entry;
}

/**
 * List all backups, newest first.
 *
 * @param filterPath Optional: only return entries whose originalPath matches this value.
 */
export async function listBackups(filterPath?: string): Promise<BackupEntry[]> {
  const manifest = readManifest();
  const entries = manifest.entries;
  if (!filterPath) return entries;
  const resolved = path.resolve(filterPath);
  return entries.filter((e) => e.originalPath === resolved);
}

/**
 * Restore a backup by ID, overwriting the original file.
 * The current file is backed up first so you can undo the undo.
 *
 * @param backupId The `id` field from a BackupEntry.
 * @throws If the backup entry or file does not exist.
 */
export async function restoreBackup(backupId: string): Promise<{ entry: BackupEntry; undoEntry: BackupEntry | null }> {
  const manifest = readManifest();
  const entry = manifest.entries.find((e) => e.id === backupId);

  if (!entry) {
    throw new Error(`Backup "${backupId}" not found. Run "claudectx revert --list" to see available backups.`);
  }

  if (!fs.existsSync(entry.backupPath)) {
    throw new Error(`Backup file missing at "${entry.backupPath}". It may have been deleted manually.`);
  }

  // Back up the current version before overwriting (so the undo is itself undoable)
  let undoEntry: BackupEntry | null = null;
  if (fs.existsSync(entry.originalPath)) {
    undoEntry = await backupFile(entry.originalPath, 'revert');
  }

  // Ensure the target directory exists (original file may have been deleted)
  const targetDir = path.dirname(entry.originalPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  fs.copyFileSync(entry.backupPath, entry.originalPath);
  return { entry, undoEntry };
}

/**
 * Remove oldest backup entries beyond MAX_BACKUPS.
 * Deletes the backup files from disk and updates the manifest.
 *
 * @returns Number of entries pruned.
 */
export async function pruneOldBackups(): Promise<number> {
  const manifest = readManifest();
  if (manifest.entries.length <= MAX_BACKUPS) return 0;

  const toRemove = manifest.entries.splice(MAX_BACKUPS); // keep newest MAX_BACKUPS
  for (const entry of toRemove) {
    try { fs.unlinkSync(entry.backupPath); } catch { /* file may already be gone */ }
  }

  writeManifest(manifest);
  return toRemove.length;
}
