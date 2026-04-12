import * as path from 'path';
import * as fs from 'fs';
import { findProjectRoot } from '../analyzer/context-parser.js';
import { detectDrift } from '../analyzer/drift-detector.js';
import type { DriftIssue } from '../analyzer/drift-detector.js';

export interface DriftOptions {
  path?: string;
  days?: string;
  fix?: boolean;
  json?: boolean;
}

const SEVERITY_ICON: Record<DriftIssue['severity'], string> = {
  error: '✖',
  warning: '⚠',
  info: '·',
};

const TYPE_LABEL: Record<DriftIssue['type'], string> = {
  'dead-ref': 'Dead @ref',
  'git-deleted': 'Git deleted',
  'stale-section': 'Stale section',
  'dead-inline-path': 'Dead path',
};

export async function driftCommand(options: DriftOptions): Promise<void> {
  const projectPath = options.path ? path.resolve(options.path) : process.cwd();
  const projectRoot = findProjectRoot(projectPath) ?? projectPath;
  const dayWindow = parseInt(options.days ?? '30', 10);

  const report = await detectDrift(projectRoot, dayWindow);

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }

  process.stdout.write('\n');
  process.stdout.write('claudectx drift — CLAUDE.md staleness check\n');
  process.stdout.write('═'.repeat(55) + '\n');
  process.stdout.write(`  File:  ${report.claudeMdPath}\n`);
  process.stdout.write(`  Window: last ${report.dayWindow} days\n`);
  process.stdout.write('\n');

  if (report.issues.length === 0) {
    process.stdout.write('  ✓ No drift detected. CLAUDE.md looks clean.\n\n');
    return;
  }

  // Print issues table
  process.stdout.write(
    `  ${'Line'.padEnd(5)}  ${'Type'.padEnd(14)}  ${'Waste'.padStart(6)}  Issue\n`,
  );
  process.stdout.write('─'.repeat(55) + '\n');

  for (const issue of report.issues) {
    const icon = SEVERITY_ICON[issue.severity];
    const typeLabel = TYPE_LABEL[issue.type].padEnd(14);
    const waste = `${issue.estimatedTokenWaste}t`.padStart(6);
    const lineNum = String(issue.line).padEnd(5);
    const text = issue.text.slice(0, 40);
    process.stdout.write(`  ${lineNum}  ${typeLabel}  ${waste}  ${icon} ${text}\n`);
  }

  process.stdout.write('─'.repeat(55) + '\n');
  process.stdout.write(
    `  ${report.issues.length} issue(s) found · ~${report.totalWastedTokens} tokens wasted\n`,
  );
  process.stdout.write('\n');

  // Print suggestions
  if (report.issues.length > 0) {
    process.stdout.write('  Suggestions:\n');
    const shown = new Set<string>();
    for (const issue of report.issues.slice(0, 5)) {
      if (!shown.has(issue.suggestion)) {
        process.stdout.write(`    Line ${issue.line}: ${issue.suggestion}\n`);
        shown.add(issue.suggestion);
      }
    }
    process.stdout.write('\n');
  }

  // Interactive fix mode
  if (options.fix && report.issues.length > 0) {
    await applyFix(report.claudeMdPath, report.issues);
  } else if (report.issues.length > 0 && !options.fix) {
    process.stdout.write('  Run with --fix to interactively remove flagged lines.\n\n');
  }
}

async function applyFix(claudeMdPath: string, issues: DriftIssue[]): Promise<void> {
  // Dynamically import to keep startup fast
  const { checkbox } = await import('@inquirer/prompts').catch(() => {
    process.stderr.write('Error: @inquirer/prompts is required for --fix mode. Run: npm install -g @inquirer/prompts\n');
    process.exit(1);
  });

  const choices = issues.map((issue) => ({
    name: `Line ${issue.line}: ${issue.text.slice(0, 60)} (${issue.estimatedTokenWaste}t)`,
    value: issue.line,
    checked: issue.severity === 'error',
  }));

  const selectedLines: number[] = await checkbox({
    message: 'Select lines to remove from CLAUDE.md:',
    choices,
  });

  if (selectedLines.length === 0) {
    process.stdout.write('No lines selected. Nothing changed.\n');
    return;
  }

  const content = fs.readFileSync(claudeMdPath, 'utf-8');
  const lines = content.split('\n');
  const lineSet = new Set(selectedLines.map((l) => l - 1)); // 0-indexed
  const newLines = lines.filter((_, i) => !lineSet.has(i));
  const newContent = newLines.join('\n');

  // Backup first
  const backupPath = `${claudeMdPath}.bak`;
  fs.writeFileSync(backupPath, content, 'utf-8');

  // Atomic write: write to temp file beside the target, then rename
  const os = await import('os');
  const tmpPath = `${claudeMdPath}.tmp-${Date.now()}`;
  try {
    fs.writeFileSync(tmpPath, newContent, 'utf-8');
    fs.renameSync(tmpPath, claudeMdPath);
  } catch (err) {
    // Roll back: restore backup
    try { fs.copyFileSync(backupPath, claudeMdPath); } catch { /* already failed */ }
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    process.stderr.write(`Error writing CLAUDE.md: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  process.stdout.write(`\n  ✓ Removed ${selectedLines.length} line(s) from ${path.basename(claudeMdPath)}\n`);
  process.stdout.write(`  ✓ Backup saved to ${backupPath}\n\n`);
  // Suppress unused import warning
  void os;
}
