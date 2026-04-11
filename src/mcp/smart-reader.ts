/**
 * Smart symbol extractor — finds and returns just the code block for a named
 * symbol (function / class / interface / type) instead of the whole file.
 *
 * Uses regex-based extraction (no native tree-sitter required).
 * Supports TypeScript, JavaScript, and Python out of the box; falls back to
 * line-range extraction for other languages.
 */
import * as fs from 'fs';
import * as path from 'path';
import { countTokens } from '../analyzer/tokenizer.js';

export type SymbolType = 'function' | 'class' | 'interface' | 'type' | 'variable' | 'unknown';

export interface ExtractedSymbol {
  name: string;
  type: SymbolType;
  filePath: string;
  startLine: number; // 1-based
  endLine: number; // 1-based
  content: string;
  tokenCount: number;
  language: Language;
}

export interface LineRangeResult {
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  tokenCount: number;
  totalLines: number;
}

export type Language = 'typescript' | 'javascript' | 'python' | 'other';

// ─── Language detection ────────────────────────────────────────────────────────

export function detectLanguage(filePath: string): Language {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.ts':
    case '.tsx':
      return 'typescript';
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.py':
      return 'python';
    default:
      return 'other';
  }
}

// ─── Symbol patterns ──────────────────────────────────────────────────────────

interface SymbolPattern {
  pattern: RegExp;
  type: SymbolType;
}

const TS_JS_PATTERNS: SymbolPattern[] = [
  // export async function name / export function name / function name
  { pattern: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/, type: 'function' },
  // export default function name
  { pattern: /^export\s+default\s+(?:async\s+)?function\s+(\w+)?/, type: 'function' },
  // const/let/var name = (params) => / async (params) =>
  { pattern: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:[(][^)]*[)]|\w+)\s*=>/, type: 'function' },
  // const/let name = function
  { pattern: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function/, type: 'function' },
  // export abstract class / export class / class
  { pattern: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/, type: 'class' },
  // export interface / interface
  { pattern: /^(?:export\s+)?interface\s+(\w+)/, type: 'interface' },
  // export type Name = / type Name =
  { pattern: /^(?:export\s+)?type\s+(\w+)\s*(?:<[^>]*>)?\s*=/, type: 'type' },
  // export enum / enum
  { pattern: /^(?:export\s+)?(?:const\s+)?enum\s+(\w+)/, type: 'type' },
  // export const NAME (capital-snake — treat as variable)
  { pattern: /^(?:export\s+)?const\s+([A-Z_][A-Z0-9_]+)\s*=/, type: 'variable' },
  // export const name (lowercase)
  { pattern: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*\S+)?\s*=/, type: 'variable' },
];

const PYTHON_PATTERNS: SymbolPattern[] = [
  { pattern: /^(?:async\s+)?def\s+(\w+)\s*\(/, type: 'function' },
  { pattern: /^class\s+(\w+)(?:\s*[(:]|$)/, type: 'class' },
  { pattern: /^([A-Z_][A-Z0-9_]+)\s*=/, type: 'variable' },
];

// ─── Find a symbol in a file ──────────────────────────────────────────────────

/**
 * Locate a named symbol in a file and return its start/end lines.
 * Returns null if the symbol cannot be found.
 */
export function findSymbol(filePath: string, symbolName: string): ExtractedSymbol | null {
  if (!fs.existsSync(filePath)) return null;

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const lang = detectLanguage(filePath);
  const patterns = lang === 'python' ? PYTHON_PATTERNS : TS_JS_PATTERNS;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    for (const { pattern, type } of patterns) {
      const match = line.match(pattern);
      if (!match) continue;

      const capturedName = match[1];
      if (!capturedName || capturedName !== symbolName) continue;

      // Found the start — now find the end
      const startLine = i + 1; // convert to 1-based
      const endLine =
        lang === 'python'
          ? findPythonBlockEnd(lines, i)
          : findBraceBlockEnd(lines, i);

      const extracted = lines.slice(i, endLine).join('\n');

      return {
        name: capturedName,
        type,
        filePath,
        startLine,
        endLine,
        content: extracted,
        tokenCount: countTokens(extracted),
        language: lang,
      };
    }
  }

  return null;
}

// ─── Block end detection ──────────────────────────────────────────────────────

/**
 * Find the end of a JS/TS block by counting balanced `{}`.
 * Returns the end line index (exclusive, 0-based) — use `.slice(start, end)`.
 */
function findBraceBlockEnd(lines: string[], startIdx: number): number {
  let depth = 0;
  let foundOpenBrace = false;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === '{') {
        depth++;
        foundOpenBrace = true;
      } else if (ch === '}') {
        depth--;
        if (foundOpenBrace && depth === 0) {
          return i + 1; // end (exclusive)
        }
      }
    }
  }

  // No matching brace found — return up to 60 lines as fallback
  return Math.min(startIdx + 60, lines.length);
}

/**
 * Find the end of a Python block by tracking indentation level.
 */
function findPythonBlockEnd(lines: string[], startIdx: number): number {
  const baseLine = lines[startIdx];
  const baseIndent = baseLine.length - baseLine.trimStart().length;

  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '' || line.trim().startsWith('#')) continue; // skip blanks/comments

    const indent = line.length - line.trimStart().length;
    if (indent <= baseIndent) {
      return i; // end (exclusive)
    }
  }

  return lines.length; // end of file
}

// ─── Line-range extraction ────────────────────────────────────────────────────

/**
 * Extract a specific line range from a file (1-based, inclusive).
 * Adds a small context buffer above and below when requested.
 */
export function extractLineRange(
  filePath: string,
  startLine: number,
  endLine: number,
  contextLines = 0
): LineRangeResult | null {
  if (!fs.existsSync(filePath)) return null;

  const allLines = fs.readFileSync(filePath, 'utf-8').split('\n');
  const totalLines = allLines.length;

  const from = Math.max(0, startLine - 1 - contextLines); // to 0-based
  const to = Math.min(totalLines, endLine + contextLines); // exclusive

  const extracted = allLines.slice(from, to).join('\n');

  return {
    filePath,
    startLine: from + 1,
    endLine: to,
    content: extracted,
    tokenCount: countTokens(extracted),
    totalLines,
  };
}

// ─── Token-aware full-file read ───────────────────────────────────────────────

export interface SmartReadResult {
  content: string;
  tokenCount: number;
  filePath: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  truncated: boolean;
  symbolName?: string;
}

const MAX_FULL_FILE_TOKENS = 8_000;

/**
 * High-level smart read:
 *  1. If `symbol` given → extract just that symbol
 *  2. If `startLine`/`endLine` given → extract that range
 *  3. Otherwise → return full file (truncated at 8K tokens if huge)
 */
export function smartRead(
  filePath: string,
  symbol?: string,
  startLine?: number,
  endLine?: number,
  contextLines = 3
): SmartReadResult {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  if (symbol) {
    const extracted = findSymbol(filePath, symbol);
    if (extracted) {
      return {
        content: extracted.content,
        tokenCount: extracted.tokenCount,
        filePath,
        startLine: extracted.startLine,
        endLine: extracted.endLine,
        totalLines: fs.readFileSync(filePath, 'utf-8').split('\n').length,
        truncated: false,
        symbolName: symbol,
      };
    }
    // Symbol not found — fall through to line range or full read
  }

  if (startLine !== undefined && endLine !== undefined) {
    const result = extractLineRange(filePath, startLine, endLine, contextLines);
    if (result) {
      return { ...result, truncated: false };
    }
  }

  // Full file read with token cap
  const fullContent = fs.readFileSync(filePath, 'utf-8');
  const allLines = fullContent.split('\n');
  const totalLines = allLines.length;
  const fullTokens = countTokens(fullContent);

  if (fullTokens <= MAX_FULL_FILE_TOKENS) {
    return {
      content: fullContent,
      tokenCount: fullTokens,
      filePath,
      startLine: 1,
      endLine: totalLines,
      totalLines,
      truncated: false,
    };
  }

  // Truncate to first N lines that fit within the token budget
  let accumulated = '';
  let lastLine = 0;
  for (let i = 0; i < allLines.length; i++) {
    const next = accumulated + allLines[i] + '\n';
    if (countTokens(next) > MAX_FULL_FILE_TOKENS) break;
    accumulated = next;
    lastLine = i + 1;
  }

  return {
    content:
      accumulated +
      `\n\n// ... file truncated at ${lastLine}/${totalLines} lines (token budget).` +
      `\n// Use smart_read with a symbol name or line range to read more.`,
    tokenCount: countTokens(accumulated),
    filePath,
    startLine: 1,
    endLine: lastLine,
    totalLines,
    truncated: true,
  };
}
