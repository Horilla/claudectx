import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Create a temp home dir whose sub-path .claudectx/ will be used by the store.
// We set this up at module level so the vi.mock factory can close over it.
const FAKE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'claudectx-home-test-'));
const STORE_DIR = path.join(FAKE_HOME, '.claudectx');
const READS_FILE = path.join(STORE_DIR, 'reads.jsonl');

// vi.mock is hoisted — factory runs lazily when 'os' is first imported by session-store
vi.mock('os', async (importOriginal) => {
  const original = await importOriginal<typeof os>();
  return { ...original, homedir: () => FAKE_HOME };
});

// Dynamic import AFTER mock registration so session-store picks up the mocked os
const {
  appendFileRead,
  readAllEvents,
  aggregateStats,
  clearStore,
  getReadsFilePath,
} = await import('../../../src/watcher/session-store.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wipe(): void {
  if (fs.existsSync(READS_FILE)) fs.writeFileSync(READS_FILE, '');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('session-store', () => {
  beforeEach(wipe);
  afterEach(wipe);

  describe('appendFileRead', () => {
    it('creates the reads file on first write', () => {
      if (fs.existsSync(READS_FILE)) fs.unlinkSync(READS_FILE);
      appendFileRead('/some/file.ts');
      expect(fs.existsSync(READS_FILE)).toBe(true);
    });

    it('appends valid JSON lines', () => {
      appendFileRead('/path/to/file.ts', 'session-123');
      const lines = fs.readFileSync(READS_FILE, 'utf-8').trim().split('\n').filter(Boolean);
      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]);
      expect(parsed.filePath).toBe('/path/to/file.ts');
      expect(parsed.sessionId).toBe('session-123');
      expect(parsed.timestamp).toBeDefined();
    });

    it('appends multiple events', () => {
      appendFileRead('/a.ts');
      appendFileRead('/b.ts');
      appendFileRead('/c.ts');
      const events = readAllEvents();
      expect(events).toHaveLength(3);
    });
  });

  describe('readAllEvents', () => {
    it('returns empty array when file does not exist', () => {
      if (fs.existsSync(READS_FILE)) fs.unlinkSync(READS_FILE);
      expect(readAllEvents()).toEqual([]);
    });

    it('skips malformed JSON lines', () => {
      fs.mkdirSync(STORE_DIR, { recursive: true });
      fs.writeFileSync(
        READS_FILE,
        '{"filePath":"/ok.ts","timestamp":"t"}\nNOT JSON\n'
      );
      const events = readAllEvents();
      expect(events).toHaveLength(1);
      expect(events[0].filePath).toBe('/ok.ts');
    });

    it('returns events in write order', () => {
      appendFileRead('/first.ts');
      appendFileRead('/second.ts');
      const events = readAllEvents();
      expect(events[0].filePath).toBe('/first.ts');
      expect(events[1].filePath).toBe('/second.ts');
    });
  });

  describe('aggregateStats (pure function — no filesystem)', () => {
    it('returns empty array for no events', () => {
      expect(aggregateStats([])).toEqual([]);
    });

    it('counts reads per file', () => {
      const events = [
        { timestamp: 't', filePath: '/a.ts' },
        { timestamp: 't', filePath: '/a.ts' },
        { timestamp: 't', filePath: '/b.ts' },
      ];
      const stats = aggregateStats(events);
      const a = stats.find((s) => s.filePath === '/a.ts')!;
      const b = stats.find((s) => s.filePath === '/b.ts')!;
      expect(a.readCount).toBe(2);
      expect(b.readCount).toBe(1);
    });

    it('sorts by readCount descending', () => {
      const events = [
        { timestamp: 't', filePath: '/b.ts' },
        { timestamp: 't', filePath: '/a.ts' },
        { timestamp: 't', filePath: '/a.ts' },
        { timestamp: 't', filePath: '/a.ts' },
      ];
      const stats = aggregateStats(events);
      expect(stats[0].filePath).toBe('/a.ts');
      expect(stats[0].readCount).toBe(3);
      expect(stats[1].filePath).toBe('/b.ts');
      expect(stats[1].readCount).toBe(1);
    });

    it('tracks firstSeen and lastSeen timestamps', () => {
      const events = [
        { timestamp: '2026-01-01T00:00:00Z', filePath: '/a.ts' },
        { timestamp: '2026-01-02T00:00:00Z', filePath: '/a.ts' },
      ];
      const stats = aggregateStats(events);
      expect(stats[0].firstSeen).toBe('2026-01-01T00:00:00Z');
      expect(stats[0].lastSeen).toBe('2026-01-02T00:00:00Z');
    });
  });

  describe('clearStore', () => {
    it('empties the reads file', () => {
      appendFileRead('/a.ts');
      appendFileRead('/b.ts');
      clearStore();
      expect(readAllEvents()).toHaveLength(0);
    });

    it('does not throw when file does not exist', () => {
      if (fs.existsSync(READS_FILE)) fs.unlinkSync(READS_FILE);
      expect(() => clearStore()).not.toThrow();
    });
  });

  describe('getReadsFilePath', () => {
    it('returns the path inside .claudectx/', () => {
      expect(getReadsFilePath()).toContain('.claudectx');
      expect(getReadsFilePath()).toMatch(/reads\.jsonl$/);
    });

    it('points at the fake home dir (mock is active)', () => {
      expect(getReadsFilePath()).toContain(FAKE_HOME);
    });
  });
});
