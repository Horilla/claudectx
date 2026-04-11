import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  detectLanguage,
  findSymbol,
  extractLineRange,
  smartRead,
} from '../../../src/mcp/smart-reader.js';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claudectx-reader-test-'));
}

// ─── TypeScript fixture ───────────────────────────────────────────────────────

const TS_FIXTURE = `import { foo } from './foo.js';

export interface Config {
  name: string;
  value: number;
}

export const MAX_SIZE = 1000;

export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export async function fetchData(url: string): Promise<string> {
  const response = await fetch(url);
  return response.text();
}

export class DataProcessor {
  private data: string[] = [];

  process(item: string): void {
    this.data.push(item);
  }

  getAll(): string[] {
    return this.data;
  }
}

export type Result<T> = {
  ok: boolean;
  value?: T;
  error?: string;
};
`;

// ─── Python fixture ───────────────────────────────────────────────────────────

const PY_FIXTURE = `import os

MAX_RETRIES = 3

def greet(name: str) -> str:
    return f"Hello, {name}!"

async def fetch_data(url: str) -> str:
    import aiohttp
    async with aiohttp.ClientSession() as s:
        async with s.get(url) as r:
            return await r.text()

class DataProcessor:
    def __init__(self):
        self.data = []

    def process(self, item):
        self.data.append(item)

    def get_all(self):
        return self.data
`;

describe('detectLanguage', () => {
  it('detects TypeScript', () => {
    expect(detectLanguage('foo.ts')).toBe('typescript');
    expect(detectLanguage('foo.tsx')).toBe('typescript');
  });
  it('detects JavaScript', () => {
    expect(detectLanguage('foo.js')).toBe('javascript');
    expect(detectLanguage('foo.mjs')).toBe('javascript');
  });
  it('detects Python', () => {
    expect(detectLanguage('foo.py')).toBe('python');
  });
  it('returns "other" for unknown extensions', () => {
    expect(detectLanguage('foo.rb')).toBe('other');
    expect(detectLanguage('foo.go')).toBe('other');
  });
});

describe('findSymbol — TypeScript', () => {
  let tmpDir: string;
  let tsFile: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    tsFile = path.join(tmpDir, 'fixture.ts');
    fs.writeFileSync(tsFile, TS_FIXTURE);
  });

  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it('returns null for a non-existent file', () => {
    expect(findSymbol('/no/such/file.ts', 'greet')).toBeNull();
  });

  it('returns null for a symbol not in the file', () => {
    expect(findSymbol(tsFile, 'noSuchSymbol')).toBeNull();
  });

  it('finds a simple exported function', () => {
    const result = findSymbol(tsFile, 'greet');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('greet');
    expect(result!.type).toBe('function');
    expect(result!.content).toContain('return `Hello');
  });

  it('finds an async function', () => {
    const result = findSymbol(tsFile, 'fetchData');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('function');
    expect(result!.content).toContain('fetch(url)');
  });

  it('finds a class', () => {
    const result = findSymbol(tsFile, 'DataProcessor');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('class');
    expect(result!.content).toContain('process(item');
    expect(result!.content).toContain('getAll()');
  });

  it('finds an interface', () => {
    const result = findSymbol(tsFile, 'Config');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('interface');
    expect(result!.content).toContain('name: string');
  });

  it('finds an exported constant', () => {
    const result = findSymbol(tsFile, 'MAX_SIZE');
    expect(result).not.toBeNull();
    expect(result!.content).toContain('1000');
  });

  it('returns correct line numbers (1-based)', () => {
    const result = findSymbol(tsFile, 'greet');
    expect(result!.startLine).toBeGreaterThan(0);
    expect(result!.endLine).toBeGreaterThanOrEqual(result!.startLine);
  });

  it('includes token count', () => {
    const result = findSymbol(tsFile, 'greet');
    expect(result!.tokenCount).toBeGreaterThan(0);
  });
});

describe('findSymbol — Python', () => {
  let tmpDir: string;
  let pyFile: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    pyFile = path.join(tmpDir, 'fixture.py');
    fs.writeFileSync(pyFile, PY_FIXTURE);
  });

  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it('finds a def function', () => {
    const result = findSymbol(pyFile, 'greet');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('function');
    expect(result!.content).toContain('return f"Hello');
  });

  it('finds an async def function', () => {
    const result = findSymbol(pyFile, 'fetch_data');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('function');
  });

  it('finds a class', () => {
    const result = findSymbol(pyFile, 'DataProcessor');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('class');
    expect(result!.content).toContain('def process');
  });

  it('finds a CONSTANT', () => {
    const result = findSymbol(pyFile, 'MAX_RETRIES');
    expect(result).not.toBeNull();
    expect(result!.content).toContain('3');
  });
});

describe('extractLineRange', () => {
  let tmpDir: string;
  let file: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    file = path.join(tmpDir, 'lines.ts');
    fs.writeFileSync(file, 'line1\nline2\nline3\nline4\nline5\n');
  });

  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it('returns null for non-existent file', () => {
    expect(extractLineRange('/no/file', 1, 3)).toBeNull();
  });

  it('extracts the correct lines (1-based, inclusive)', () => {
    const result = extractLineRange(file, 2, 4);
    expect(result).not.toBeNull();
    expect(result!.content).toContain('line2');
    expect(result!.content).toContain('line3');
    expect(result!.content).toContain('line4');
    expect(result!.content).not.toContain('line1');
    expect(result!.content).not.toContain('line5');
  });

  it('includes context lines when requested', () => {
    const result = extractLineRange(file, 3, 3, 1);
    expect(result!.content).toContain('line2'); // context above
    expect(result!.content).toContain('line3');
    expect(result!.content).toContain('line4'); // context below
  });

  it('includes tokenCount', () => {
    const result = extractLineRange(file, 1, 3);
    expect(result!.tokenCount).toBeGreaterThan(0);
  });
});

describe('smartRead', () => {
  let tmpDir: string;
  let tsFile: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    tsFile = path.join(tmpDir, 'fixture.ts');
    fs.writeFileSync(tsFile, TS_FIXTURE);
  });

  afterEach(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  it('throws for non-existent file', () => {
    expect(() => smartRead('/no/file.ts')).toThrow();
  });

  it('reads a symbol when name is provided', () => {
    const result = smartRead(tsFile, 'greet');
    expect(result.symbolName).toBe('greet');
    expect(result.content).toContain('Hello');
    expect(result.truncated).toBe(false);
  });

  it('reads full file when no symbol or range given', () => {
    const result = smartRead(tsFile);
    expect(result.content).toContain('DataProcessor');
    expect(result.startLine).toBe(1);
  });

  it('reads a line range when given', () => {
    const result = smartRead(tsFile, undefined, 1, 5);
    expect(result.startLine).toBe(1);
    expect(result.endLine).toBeLessThanOrEqual(8); // 5 lines + 3 context
  });
});
