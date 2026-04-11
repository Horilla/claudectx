import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  parseMemoryFile,
  buildEntryBlock,
  appendEntry,
  pruneOldEntries,
  isAlreadyCompressed,
} from '../../../src/compressor/memory-writer.js';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'claudectx-memory-test-'));

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true });
});

function tmpFile(name: string): string {
  return path.join(TMP_DIR, name);
}

function write(p: string, content: string): void {
  fs.writeFileSync(p, content, 'utf-8');
}

// ─── buildEntryBlock ──────────────────────────────────────────────────────────

describe('buildEntryBlock', () => {
  it('contains the claudectx-entry marker', () => {
    const block = buildEntryBlock('test-session-id', '- Fixed bug X\n- Added feature Y');
    expect(block).toContain('<!-- claudectx-entry:');
    expect(block).toContain('session: test-session-id');
  });

  it('trims leading/trailing whitespace from summary text', () => {
    const block = buildEntryBlock('sid', '  - item  \n\n');
    expect(block).toContain('- item');
    // The trimmed content should not have trailing blank lines after the item
    expect(block).not.toContain('- item  ');
  });

  it('uses provided date', () => {
    const date = new Date('2026-01-15T00:00:00Z');
    const block = buildEntryBlock('my-session', 'body', date);
    expect(block).toContain('2026-01-15');
    expect(block).toContain('### [2026-01-15]');
  });

  it('ends with the --- separator', () => {
    const block = buildEntryBlock('s', 'body');
    expect(block.trim()).toMatch(/---$/);
  });
});

// ─── parseMemoryFile ──────────────────────────────────────────────────────────

describe('parseMemoryFile', () => {
  it('returns empty for non-existent file', () => {
    const result = parseMemoryFile(tmpFile('nonexistent.md'));
    expect(result.preamble).toBe('');
    expect(result.entries).toHaveLength(0);
  });

  it('treats file with no markers as preamble', () => {
    const p = tmpFile('noemarks.md');
    write(p, '# My Memory\n\nSome content here.\n');
    const result = parseMemoryFile(p);
    expect(result.preamble).toContain('My Memory');
    expect(result.entries).toHaveLength(0);
  });

  it('parses one managed entry', () => {
    const p = tmpFile('one-entry.md');
    write(
      p,
      [
        '# Preamble',
        '',
        '<!-- claudectx-entry: 2026-04-11 | session: abc12345 -->',
        '### [2026-04-11] Session abc1…',
        '',
        '- Did stuff',
        '',
        '---',
      ].join('\n')
    );

    const result = parseMemoryFile(p);
    expect(result.preamble).toContain('Preamble');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].sessionId).toBe('abc12345');
    expect(result.entries[0].date).toBe('2026-04-11');
  });

  it('parses multiple entries preserving order', () => {
    const p = tmpFile('multi-entry.md');
    write(
      p,
      [
        '<!-- claudectx-entry: 2026-04-10 | session: sess0001 -->',
        '### [2026-04-10] Session sess0…',
        '',
        '- Entry one',
        '',
        '---',
        '',
        '<!-- claudectx-entry: 2026-04-11 | session: sess0002 -->',
        '### [2026-04-11] Session sess0…',
        '',
        '- Entry two',
        '',
        '---',
      ].join('\n')
    );

    const result = parseMemoryFile(p);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].sessionId).toBe('sess0001');
    expect(result.entries[1].sessionId).toBe('sess0002');
  });
});

// ─── appendEntry ──────────────────────────────────────────────────────────────

describe('appendEntry', () => {
  it('creates MEMORY.md if missing', () => {
    const p = tmpFile('create-new.md');
    appendEntry(p, 'new-session-id-001', '- New entry');
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.readFileSync(p, 'utf-8')).toContain('new-session-id-001');
  });

  it('appends to existing file preserving preamble', () => {
    const p = tmpFile('append-test.md');
    write(p, '# My Notes\n\nKeep this.\n');
    appendEntry(p, 'sess-append-01', '- Appended entry');
    const content = fs.readFileSync(p, 'utf-8');
    expect(content).toContain('My Notes');
    expect(content).toContain('Keep this.');
    expect(content).toContain('sess-append-01');
  });

  it('throws if session already present', () => {
    const p = tmpFile('dupe-test.md');
    appendEntry(p, 'duplicate-session', '- First write');
    expect(() => appendEntry(p, 'duplicate-session', '- Second write')).toThrow('already in MEMORY.md');
  });
});

// ─── pruneOldEntries ──────────────────────────────────────────────────────────

describe('pruneOldEntries', () => {
  it('returns zeros for missing file', () => {
    const result = pruneOldEntries(tmpFile('no-file.md'), 30);
    expect(result.removed).toBe(0);
    expect(result.kept).toBe(0);
  });

  it('removes entries older than cutoff', () => {
    const p = tmpFile('prune-test.md');

    // Write two entries: one old, one recent
    write(
      p,
      [
        '<!-- claudectx-entry: 2020-01-01 | session: old-session-xxxx -->',
        '### [2020-01-01] Session old-…',
        '',
        '- Old entry',
        '',
        '---',
        '',
        `<!-- claudectx-entry: 2026-04-11 | session: new-session-xxxx -->`,
        `### [2026-04-11] Session new-…`,
        '',
        '- Recent entry',
        '',
        '---',
      ].join('\n')
    );

    const result = pruneOldEntries(p, 30);
    expect(result.removed).toBe(1);
    expect(result.kept).toBe(1);
    expect(result.removedEntries[0].sessionId).toBe('old-session-xxxx');

    const remaining = fs.readFileSync(p, 'utf-8');
    expect(remaining).not.toContain('old-session-xxxx');
    expect(remaining).toContain('new-session-xxxx');
  });

  it('returns zero removed when all entries are within range', () => {
    const p = tmpFile('no-prune-needed.md');
    write(
      p,
      [
        `<!-- claudectx-entry: 2026-04-11 | session: recent-session-a -->`,
        `### [2026-04-11] Session rece…`,
        '',
        '- Recent',
        '',
        '---',
      ].join('\n')
    );

    const result = pruneOldEntries(p, 30);
    expect(result.removed).toBe(0);
    expect(result.kept).toBe(1);
  });
});

// ─── isAlreadyCompressed ──────────────────────────────────────────────────────

describe('isAlreadyCompressed', () => {
  it('returns false for missing file', () => {
    expect(isAlreadyCompressed(tmpFile('ghost.md'), 'any-session')).toBe(false);
  });

  it('returns true when session is in file', () => {
    const p = tmpFile('already.md');
    appendEntry(p, 'known-session-id', '- Entry body');
    expect(isAlreadyCompressed(p, 'known-session-id')).toBe(true);
  });

  it('returns false for unknown session', () => {
    const p = tmpFile('known.md');
    appendEntry(p, 'session-known-abc', '- Body');
    expect(isAlreadyCompressed(p, 'session-unknown-xyz')).toBe(false);
  });
});
