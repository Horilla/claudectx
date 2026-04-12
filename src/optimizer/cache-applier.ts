import * as fs from 'fs';
import { CACHE_BUSTERS } from '../shared/constants.js';
import { backupFile } from '../shared/backup-manager.js';

export interface CacheFix {
  label: string;
  lineNumber: number; // 1-based
  originalLine: string;
  fixedLine: string;
}

export interface CacheApplierResult {
  fixes: CacheFix[];
  newContent: string;
}

/**
 * Scan CLAUDE.md content for lines that contain cache-busting patterns.
 * Returns a list of proposed fixes (does NOT modify the file).
 */
export function findCacheBusters(content: string): CacheFix[] {
  const fixes: CacheFix[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const buster of CACHE_BUSTERS) {
      // Recreate without the global flag to avoid stateful lastIndex issues
      const re = new RegExp(buster.pattern.source, 'i');
      if (re.test(line)) {
        fixes.push({
          label: buster.label,
          lineNumber: i + 1,
          originalLine: line,
          // Comment-out the line so content is still vaguely visible in the file
          fixedLine: `<!-- claudectx removed cache-busting content (${buster.label}): ${line.trim()} -->`,
        });
        break; // only flag each line once
      }
    }
  }

  return fixes;
}

/**
 * Apply the list of fixes to the content string and return the modified text.
 */
export function applyCacheFixes(content: string, fixes: CacheFix[]): string {
  const lines = content.split('\n');
  for (const fix of fixes) {
    lines[fix.lineNumber - 1] = fix.fixedLine;
  }
  return lines.join('\n');
}

/**
 * High-level: read a file, find cache busters, apply fixes, return result.
 * Does NOT write anything to disk.
 */
export function planCacheFixes(claudeMdPath: string): CacheApplierResult {
  const content = fs.readFileSync(claudeMdPath, 'utf-8');
  const fixes = findCacheBusters(content);
  return { fixes, newContent: applyCacheFixes(content, fixes) };
}

/**
 * Write the fixed content back to disk.
 * Backs up CLAUDE.md first so the user can run `claudectx revert` to undo.
 */
export async function applyAndWriteCacheFixes(claudeMdPath: string, result: CacheApplierResult): Promise<void> {
  if (fs.existsSync(claudeMdPath)) {
    await backupFile(claudeMdPath, 'optimize');
  }
  fs.writeFileSync(claudeMdPath, result.newContent, 'utf-8');
}
