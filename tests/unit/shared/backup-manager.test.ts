import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  backupFile,
  listBackups,
  restoreBackup,
  pruneOldBackups,
  setBackupDirForTesting,
  getBackupDir,
  MAX_BACKUPS,
} from '../../../src/shared/backup-manager.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claudectx-bm-'));
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('backupFile', () => {
  let tmpDir: string;
  let backupDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    backupDir = makeTmpDir();
    setBackupDirForTesting(backupDir);
  });

  afterEach(() => {
    setBackupDirForTesting(null);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(backupDir, { recursive: true, force: true });
  });

  it('creates a backup file in the backup dir and returns a BackupEntry', async () => {
    const src = path.join(tmpDir, 'CLAUDE.md');
    writeFile(src, '# My project');

    const entry = await backupFile(src, 'optimize');

    expect(entry.originalPath).toBe(src);
    expect(entry.command).toBe('optimize');
    expect(entry.sizeBytes).toBeGreaterThan(0);
    expect(fs.existsSync(entry.backupPath)).toBe(true);
    expect(fs.readFileSync(entry.backupPath, 'utf-8')).toBe('# My project');
  });

  it('adds the entry to the manifest (newest first)', async () => {
    const src = path.join(tmpDir, 'CLAUDE.md');
    writeFile(src, 'v1');

    await backupFile(src, 'optimize');
    writeFile(src, 'v2');
    await backupFile(src, 'optimize');

    const entries = await listBackups(src);
    expect(entries.length).toBe(2);
    // Newest should be first
    expect(new Date(entries[0].createdAt) >= new Date(entries[1].createdAt)).toBe(true);
  });

  it('throws if source file does not exist', async () => {
    await expect(backupFile('/nonexistent/CLAUDE.md', 'optimize')).rejects.toThrow(
      'does not exist'
    );
  });
});

describe('listBackups', () => {
  let tmpDir: string;
  let backupDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    backupDir = makeTmpDir();
    setBackupDirForTesting(backupDir);
  });

  afterEach(() => {
    setBackupDirForTesting(null);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(backupDir, { recursive: true, force: true });
  });

  it('returns all entries when no filter given', async () => {
    const fileA = path.join(tmpDir, 'CLAUDE.md');
    const fileB = path.join(tmpDir, 'MEMORY.md');
    writeFile(fileA, 'a');
    writeFile(fileB, 'b');

    await backupFile(fileA, 'optimize');
    await backupFile(fileB, 'compress');

    const entries = await listBackups();
    expect(entries.length).toBe(2);
  });

  it('filters by originalPath when filterPath is provided', async () => {
    const fileA = path.join(tmpDir, 'CLAUDE.md');
    const fileB = path.join(tmpDir, 'MEMORY.md');
    writeFile(fileA, 'a');
    writeFile(fileB, 'b');

    await backupFile(fileA, 'optimize');
    await backupFile(fileB, 'compress');

    const entries = await listBackups(fileA);
    expect(entries.length).toBe(1);
    expect(entries[0].originalPath).toBe(fileA);
  });
});

describe('restoreBackup', () => {
  let tmpDir: string;
  let backupDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    backupDir = makeTmpDir();
    setBackupDirForTesting(backupDir);
  });

  afterEach(() => {
    setBackupDirForTesting(null);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(backupDir, { recursive: true, force: true });
  });

  it('restores original file content', async () => {
    const src = path.join(tmpDir, 'CLAUDE.md');
    writeFile(src, 'original content');

    const entry = await backupFile(src, 'optimize');

    // Overwrite the file
    writeFile(src, 'overwritten content');
    await restoreBackup(entry.id);

    expect(fs.readFileSync(src, 'utf-8')).toBe('original content');
  });

  it('backs up the current file before restoring (undo the undo)', async () => {
    const src = path.join(tmpDir, 'CLAUDE.md');
    writeFile(src, 'v1');
    const entry = await backupFile(src, 'optimize');

    writeFile(src, 'v2');
    const { undoEntry } = await restoreBackup(entry.id);

    expect(undoEntry).not.toBeNull();
    expect(fs.readFileSync(undoEntry!.backupPath, 'utf-8')).toBe('v2');
  });

  it('throws if backup id does not exist in manifest', async () => {
    await expect(restoreBackup('nonexistent-id')).rejects.toThrow('not found');
  });

  it('throws if backup file is missing from disk', async () => {
    const src = path.join(tmpDir, 'CLAUDE.md');
    writeFile(src, 'content');
    const entry = await backupFile(src, 'test');

    // Delete the backup file manually
    fs.unlinkSync(entry.backupPath);

    await expect(restoreBackup(entry.id)).rejects.toThrow('missing');
  });
});

describe('pruneOldBackups', () => {
  let tmpDir: string;
  let backupDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    backupDir = makeTmpDir();
    setBackupDirForTesting(backupDir);
  });

  afterEach(() => {
    setBackupDirForTesting(null);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(backupDir, { recursive: true, force: true });
  });

  it('removes oldest entries beyond MAX_BACKUPS when manifest is seeded directly', async () => {
    // Directly write a manifest with MAX_BACKUPS + 3 entries to test pruneOldBackups
    // independently of backupFile's own auto-prune behavior.
    const total = MAX_BACKUPS + 3;
    const fakeEntries = Array.from({ length: total }, (_, i) => ({
      id: `fake-entry-${i}`,
      originalPath: path.join(tmpDir, `file-${i}.md`),
      backupPath: path.join(backupDir, `fake-entry-${i}`),
      command: 'test',
      createdAt: new Date(Date.now() - i * 1000).toISOString(),
      sizeBytes: 100,
    }));
    // Create dummy backup files so unlinkSync doesn't fail
    for (const e of fakeEntries) {
      fs.writeFileSync(e.backupPath, 'dummy', 'utf-8');
    }
    const manifestPath = path.join(backupDir, 'manifest.json');
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({ version: '1', entries: fakeEntries }, null, 2),
      'utf-8'
    );

    const pruned = await pruneOldBackups();
    expect(pruned).toBe(3);

    const after = await listBackups();
    expect(after.length).toBe(MAX_BACKUPS);
  });

  it('returns 0 when entry count is within MAX_BACKUPS', async () => {
    const src = path.join(tmpDir, 'CLAUDE.md');
    writeFile(src, 'content');
    await backupFile(src, 'test');

    const pruned = await pruneOldBackups();
    expect(pruned).toBe(0);
  });
});

describe('manifest atomicity', () => {
  let tmpDir: string;
  let backupDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    backupDir = makeTmpDir();
    setBackupDirForTesting(backupDir);
  });

  afterEach(() => {
    setBackupDirForTesting(null);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(backupDir, { recursive: true, force: true });
  });

  it('does not leave a .tmp file behind after writing', async () => {
    const src = path.join(tmpDir, 'CLAUDE.md');
    writeFile(src, 'test');
    await backupFile(src, 'test');

    const activeDir = getBackupDir();
    const files = fs.readdirSync(activeDir);
    const tmpFiles = files.filter((f) => f.includes('.tmp-'));
    expect(tmpFiles.length).toBe(0);
  });
});
