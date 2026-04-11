import * as fs from 'fs';
import * as path from 'path';
import * as childProcess from 'child_process';
import { countTokens } from './tokenizer.js';
import { readAllEvents } from '../watcher/session-store.js';
import type { FileReadEvent } from '../watcher/session-store.js';

export interface DriftIssue {
  type: 'dead-ref' | 'git-deleted' | 'stale-section' | 'dead-inline-path';
  line: number;
  text: string;
  severity: 'error' | 'warning' | 'info';
  estimatedTokenWaste: number;
  suggestion: string;
}

export interface DriftReport {
  claudeMdPath: string;
  analyzedAt: string;
  dayWindow: number;
  issues: DriftIssue[];
  totalWastedTokens: number;
}

/** Regex for inline file paths in prose (e.g. src/old/file.py, ./lib/helper.ts) */
const INLINE_PATH_RE = /(?:^|\s)((?:\.{1,2}\/|src\/|lib\/|docs\/|app\/|tests?\/)\S+\.\w{1,6})/gm;

/** Regex for @file references */
const AT_REF_RE = /^@(.+)$/;

/**
 * Find @file references in CLAUDE.md that don't exist on disk.
 */
export function findDeadAtReferences(content: string, projectRoot: string): DriftIssue[] {
  const issues: DriftIssue[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(AT_REF_RE);
    if (!match) continue;

    const ref = match[1].trim();
    const absPath = path.isAbsolute(ref) ? ref : path.join(projectRoot, ref);

    if (!fs.existsSync(absPath)) {
      const lineText = lines[i];
      issues.push({
        type: 'dead-ref',
        line: i + 1,
        text: lineText,
        severity: 'error',
        estimatedTokenWaste: countTokens(lineText),
        suggestion: `File "${ref}" does not exist. Remove this @reference or update the path.`,
      });
    }
  }

  return issues;
}

/**
 * Find files mentioned in CLAUDE.md that git shows as deleted.
 * Degrades gracefully in non-git directories.
 */
export async function findGitDeletedMentions(
  content: string,
  projectRoot: string,
): Promise<DriftIssue[]> {
  const issues: DriftIssue[] = [];

  // Get list of git-deleted files
  let deletedFiles: Set<string> = new Set();
  try {
    const output = childProcess.execSync(
      'git log --diff-filter=D --name-only --pretty=format: --',
      { cwd: projectRoot, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    deletedFiles = new Set(
      output
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean),
    );
  } catch {
    // Not a git repo or git not installed — skip silently
    return [];
  }

  if (deletedFiles.size === 0) return [];

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const deleted of deletedFiles) {
      // Check if this deleted file name appears in the line
      const basename = path.basename(deleted);
      if (line.includes(basename) || line.includes(deleted)) {
        issues.push({
          type: 'git-deleted',
          line: i + 1,
          text: line.trim(),
          severity: 'warning',
          estimatedTokenWaste: countTokens(line),
          suggestion: `References "${basename}" which was deleted from git. Consider removing this mention.`,
        });
        break; // Only one issue per line
      }
    }
  }

  return issues;
}

/**
 * Find ## sections that have had zero file reads match their topic in the last N days.
 */
export function findStaleSections(
  content: string,
  events: FileReadEvent[],
  dayWindow: number,
): DriftIssue[] {
  const issues: DriftIssue[] = [];

  // Filter events to the day window
  const cutoff = Date.now() - dayWindow * 24 * 60 * 60 * 1000;
  const recentEvents = events.filter((e) => new Date(e.timestamp).getTime() >= cutoff);

  // Build a set of all recently-read file paths (lowercased for fuzzy matching)
  const recentPaths = new Set(
    recentEvents.map((e) => e.filePath.toLowerCase()),
  );

  // Parse sections: ## Header lines
  const lines = content.split('\n');
  const sections: Array<{ line: number; header: string; bodyLines: string[] }> = [];

  let currentSection: { line: number; header: string; bodyLines: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const sectionMatch = lines[i].match(/^#{1,3}\s+(.+)$/);
    if (sectionMatch) {
      if (currentSection) sections.push(currentSection);
      currentSection = { line: i + 1, header: sectionMatch[1], bodyLines: [] };
    } else if (currentSection) {
      currentSection.bodyLines.push(lines[i]);
    }
  }
  if (currentSection) sections.push(currentSection);

  for (const section of sections) {
    // Check if any recently-read file path contains a word from the section header
    const headerWords = section.header
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3);

    const matched = headerWords.some((word) =>
      [...recentPaths].some((p) => {
        if (p.includes(word)) return true;
        // Also check if any path segment starts with the header word or vice-versa
        // e.g. "testing" matches paths containing "tests"
        const segments = p.split(/[/\\.]/).filter((s) => s.length >= 4);
        return segments.some((seg) => word.startsWith(seg) || seg.startsWith(word));
      }),
    );

    if (!matched && recentEvents.length > 0) {
      const sectionContent = section.bodyLines.join('\n');
      issues.push({
        type: 'stale-section',
        line: section.line,
        text: `## ${section.header}`,
        severity: 'info',
        estimatedTokenWaste: countTokens(`## ${section.header}\n${sectionContent}`),
        suggestion: `Section "## ${section.header}" had no matching file reads in the last ${dayWindow} days. Consider removing or archiving it.`,
      });
    }
  }

  return issues;
}

/**
 * Find inline file paths in prose that no longer exist on disk.
 */
export function findDeadInlinePaths(content: string, projectRoot: string): DriftIssue[] {
  const issues: DriftIssue[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip @reference lines (handled by findDeadAtReferences)
    if (AT_REF_RE.test(line)) continue;

    let match: RegExpExecArray | null;
    INLINE_PATH_RE.lastIndex = 0;
    const seen = new Set<string>();

    while ((match = INLINE_PATH_RE.exec(line)) !== null) {
      const rawPath = match[1].trim();
      if (seen.has(rawPath)) continue;
      seen.add(rawPath);

      const absPath = path.isAbsolute(rawPath) ? rawPath : path.join(projectRoot, rawPath);
      if (!fs.existsSync(absPath)) {
        issues.push({
          type: 'dead-inline-path',
          line: i + 1,
          text: line.trim(),
          severity: 'warning',
          estimatedTokenWaste: countTokens(rawPath),
          suggestion: `Path "${rawPath}" no longer exists. Update or remove this reference.`,
        });
        break; // One issue per line to avoid noise
      }
    }
  }

  return issues;
}

/**
 * Run all drift checks and produce a consolidated report.
 */
export async function detectDrift(projectRoot: string, dayWindow: number): Promise<DriftReport> {
  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
  let content = '';
  try {
    content = fs.readFileSync(claudeMdPath, 'utf-8');
  } catch {
    // No CLAUDE.md — return empty report
    return {
      claudeMdPath,
      analyzedAt: new Date().toISOString(),
      dayWindow,
      issues: [],
      totalWastedTokens: 0,
    };
  }

  const events = readAllEvents();

  const [deadRefs, gitDeleted, staleSections, deadInlinePaths] = await Promise.all([
    Promise.resolve(findDeadAtReferences(content, projectRoot)),
    findGitDeletedMentions(content, projectRoot),
    Promise.resolve(findStaleSections(content, events, dayWindow)),
    Promise.resolve(findDeadInlinePaths(content, projectRoot)),
  ]);

  const allIssues = [...deadRefs, ...gitDeleted, ...staleSections, ...deadInlinePaths];
  // Sort by line number
  allIssues.sort((a, b) => a.line - b.line);

  const totalWastedTokens = allIssues.reduce((sum, i) => sum + i.estimatedTokenWaste, 0);

  return {
    claudeMdPath,
    analyzedAt: new Date().toISOString(),
    dayWindow,
    issues: allIssues,
    totalWastedTokens,
  };
}
