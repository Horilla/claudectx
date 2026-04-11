/**
 * In-memory symbol index built by scanning source files in a project.
 * Powers the `search_symbols` MCP tool.
 *
 * Supports TypeScript, JavaScript, and Python. Built lazily on first query.
 */
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { detectLanguage, type SymbolType } from './smart-reader.js';

export interface SymbolEntry {
  name: string;
  type: SymbolType;
  filePath: string;
  lineStart: number; // 1-based
  signature: string; // first line of the declaration
}

// ─── Index builder ────────────────────────────────────────────────────────────

const TS_JS_EXTRACTORS: Array<{ pattern: RegExp; type: SymbolType }> = [
  { pattern: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/, type: 'function' },
  { pattern: /^export\s+default\s+(?:async\s+)?function\s+(\w+)/, type: 'function' },
  { pattern: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:[(][^)]*[)]|\w+)\s*=>/, type: 'function' },
  { pattern: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function/, type: 'function' },
  { pattern: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/, type: 'class' },
  { pattern: /^(?:export\s+)?interface\s+(\w+)/, type: 'interface' },
  { pattern: /^(?:export\s+)?type\s+(\w+)\s*(?:<[^>]*>)?\s*=/, type: 'type' },
  { pattern: /^(?:export\s+)?(?:const\s+)?enum\s+(\w+)/, type: 'type' },
  { pattern: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*\S+)?\s*=/, type: 'variable' },
];

const PYTHON_EXTRACTORS: Array<{ pattern: RegExp; type: SymbolType }> = [
  { pattern: /^(?:async\s+)?def\s+(\w+)\s*\(/, type: 'function' },
  { pattern: /^class\s+(\w+)(?:\s*[(:]|$)/, type: 'class' },
  { pattern: /^([A-Z_][A-Z0-9_]+)\s*=/, type: 'variable' },
];

function extractSymbolsFromFile(filePath: string): SymbolEntry[] {
  const lang = detectLanguage(filePath);
  if (lang === 'other') return [];

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const lines = content.split('\n');
  const extractors = lang === 'python' ? PYTHON_EXTRACTORS : TS_JS_EXTRACTORS;
  const results: SymbolEntry[] = [];
  const seenNames = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) continue;

    for (const { pattern, type } of extractors) {
      const match = trimmed.match(pattern);
      if (!match?.[1]) continue;
      const name = match[1];
      if (seenNames.has(name)) continue; // deduplicate within file
      seenNames.add(name);

      results.push({
        name,
        type,
        filePath,
        lineStart: i + 1,
        signature: lines[i].trimEnd(),
      });
      break; // only one pattern per line
    }
  }

  return results;
}

// ─── SymbolIndex class ────────────────────────────────────────────────────────

const SOURCE_GLOBS = [
  '**/*.ts',
  '**/*.tsx',
  '**/*.js',
  '**/*.jsx',
  '**/*.mjs',
  '**/*.py',
];

const IGNORE_DIRS = [
  'node_modules/**',
  'dist/**',
  'build/**',
  '.git/**',
  '__pycache__/**',
  '*.min.js',
  '**/*.d.ts',
];

export class SymbolIndex {
  private entries: SymbolEntry[] = [];
  private builtFor: string | null = null;
  private buildInProgress = false;

  /** Build the index for a project root. Subsequent calls are no-ops if root matches. */
  async build(projectRoot: string): Promise<{ fileCount: number; symbolCount: number }> {
    if (this.builtFor === projectRoot) {
      return { fileCount: 0, symbolCount: this.entries.length };
    }
    if (this.buildInProgress) {
      // Wait briefly and return current state
      await new Promise((r) => setTimeout(r, 200));
      return { fileCount: 0, symbolCount: this.entries.length };
    }

    this.buildInProgress = true;
    this.entries = [];

    let files: string[] = [];
    try {
      files = await glob(SOURCE_GLOBS.map((g) => path.join(projectRoot, g)), {
        ignore: IGNORE_DIRS.map((g) => path.join(projectRoot, g)),
        absolute: true,
      });
    } catch {
      /* glob failure — proceed with empty */
    }

    for (const file of files) {
      const symbols = extractSymbolsFromFile(file);
      this.entries.push(...symbols);
    }

    this.builtFor = projectRoot;
    this.buildInProgress = false;

    return { fileCount: files.length, symbolCount: this.entries.length };
  }

  /** Rebuild the index (e.g. after file changes). */
  async rebuild(projectRoot: string): Promise<{ fileCount: number; symbolCount: number }> {
    this.builtFor = null;
    return this.build(projectRoot);
  }

  /**
   * Search for symbols matching the query.
   *
   * @param query - Partial or full symbol name (case-insensitive substring match)
   * @param type  - Optional filter by symbol type
   * @param pathFilter - Optional substring filter on the file path
   * @param limit - Max results to return (default 20)
   */
  search(
    query: string,
    type?: SymbolType | 'all',
    pathFilter?: string,
    limit = 20
  ): SymbolEntry[] {
    const q = query.toLowerCase();
    return this.entries
      .filter((e) => {
        if (!e.name.toLowerCase().includes(q)) return false;
        if (type && type !== 'all' && e.type !== type) return false;
        if (pathFilter && !e.filePath.includes(pathFilter)) return false;
        return true;
      })
      .slice(0, limit);
  }

  /** Total symbol count. */
  get size(): number {
    return this.entries.length;
  }

  /** Whether the index has been built. */
  get isReady(): boolean {
    return this.builtFor !== null;
  }
}

// Shared singleton used by the MCP server
export const globalIndex = new SymbolIndex();
