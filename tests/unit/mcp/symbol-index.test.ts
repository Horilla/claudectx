import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SymbolIndex } from '../../../src/mcp/symbol-index.js';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claudectx-index-test-'));
}

// ─── Test project fixture ─────────────────────────────────────────────────────

const TS_FILE = `export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export class MyService {
  handle(): void {}
}

export interface MyConfig {
  timeout: number;
}

export type MyResult = string | null;

export const MAX_RETRIES = 3;
`;

const PY_FILE = `def hello(name):
    return f"Hello, {name}"

class MyHelper:
    def run(self):
        pass

MAX_WORKERS = 8
`;

describe('SymbolIndex', () => {
  let tmpDir: string;
  let index: SymbolIndex;

  beforeEach(async () => {
    tmpDir = makeTempDir();

    // Create subdirectory structure
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'service.ts'), TS_FILE);
    fs.writeFileSync(path.join(tmpDir, 'helper.py'), PY_FILE);

    index = new SymbolIndex();
    await index.build(tmpDir);
  });

  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  describe('build', () => {
    it('is ready after building', () => {
      expect(index.isReady).toBe(true);
    });

    it('indexes symbols from TypeScript files', () => {
      const results = index.search('greet');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('greet');
    });

    it('indexes symbols from Python files', () => {
      const results = index.search('hello');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].name).toBe('hello');
    });

    it('indexes classes', () => {
      const classes = index.search('MyService', 'class');
      expect(classes.length).toBeGreaterThan(0);
      expect(classes[0].type).toBe('class');
    });

    it('is a no-op when called again with the same root', async () => {
      const result = await index.build(tmpDir);
      expect(result.fileCount).toBe(0); // no rescan
    });

    it('has a positive size after building', () => {
      expect(index.size).toBeGreaterThan(0);
    });
  });

  describe('search', () => {
    it('returns empty array for no matches', () => {
      expect(index.search('xyzNotFound')).toHaveLength(0);
    });

    it('is case-insensitive', () => {
      const results = index.search('GREET');
      expect(results.length).toBeGreaterThan(0);
    });

    it('does substring matching', () => {
      const results = index.search('reet'); // matches "greet"
      expect(results.length).toBeGreaterThan(0);
    });

    it('filters by type: function', () => {
      const fns = index.search('greet', 'function');
      expect(fns.every((r) => r.type === 'function')).toBe(true);
    });

    it('filters by type: class', () => {
      const classes = index.search('My', 'class');
      expect(classes.every((r) => r.type === 'class')).toBe(true);
    });

    it('filters by path_filter', () => {
      const tsOnly = index.search('My', 'all', 'service.ts');
      expect(tsOnly.every((r) => r.filePath.includes('service.ts'))).toBe(true);
    });

    it('respects the limit parameter', () => {
      const limited = index.search('', 'all', undefined, 2);
      expect(limited.length).toBeLessThanOrEqual(2);
    });

    it('returns entries with filePath and lineStart', () => {
      const results = index.search('greet');
      expect(results[0].filePath).toBeTruthy();
      expect(results[0].lineStart).toBeGreaterThan(0);
    });

    it('returns entries with signature text', () => {
      const results = index.search('greet');
      expect(results[0].signature).toContain('greet');
    });
  });

  describe('rebuild', () => {
    it('resets and rebuilds the index', async () => {
      // Add a new file and rebuild
      fs.writeFileSync(
        path.join(tmpDir, 'extra.ts'),
        'export function extraFn(): void {}\n'
      );
      await index.rebuild(tmpDir);
      const results = index.search('extraFn');
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
