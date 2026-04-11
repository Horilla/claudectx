import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import boxen from 'boxen';
import { checkbox, confirm } from '@inquirer/prompts';
import { ContextAnalyzer } from '../analyzer/index.js';
import { findProjectRoot } from '../analyzer/context-parser.js';
import { logger } from '../shared/logger.js';
import type { AnalysisReport, WasteCode } from '../shared/types.js';
import { generateIgnorefile, writeIgnorefile } from '../optimizer/ignorefile-generator.js';
import {
  parseSections,
  planSplit,
  applySplit,
  SPLIT_MIN_TOKENS,
} from '../optimizer/claudemd-splitter.js';
import {
  planCacheFixes,
  applyAndWriteCacheFixes,
} from '../optimizer/cache-applier.js';
import {
  planHooksInstall,
  applyHooksInstall,
  isAlreadyInstalled,
} from '../optimizer/hooks-installer.js';

interface OptimizeOptions {
  path?: string;
  apply?: boolean;
  dryRun?: boolean;
  claudemd?: boolean;
  ignorefile?: boolean;
  cache?: boolean;
  hooks?: boolean;
  apiKey?: string;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function optimizeCommand(options: OptimizeOptions): Promise<void> {
  const projectPath = options.path
    ? path.resolve(options.path)
    : (findProjectRoot() ?? process.cwd());

  const dryRun = options.dryRun ?? false;
  const autoApply = options.apply ?? false;

  // Check if a specific sub-optimizer was requested directly
  const specificMode =
    options.claudemd || options.ignorefile || options.cache || options.hooks;

  // Print header
  console.log(
    boxen(
      chalk.bold('claudectx — Optimize') +
        '\n' +
        chalk.dim(`Project: ${projectPath}`) +
        (dryRun ? '\n' + chalk.yellow('Dry run — no files will be changed') : ''),
      { padding: 1, borderStyle: 'round', borderColor: dryRun ? 'yellow' : 'cyan' }
    )
  );

  // Always run analysis first so we know what needs fixing
  logger.info('Analyzing context...');
  const analyzer = new ContextAnalyzer('claude-sonnet-4-6');
  const report = await analyzer.analyze(projectPath);

  const hasWarning = (code: WasteCode) => report.warnings.some((w) => w.code === code);

  // ── Build the menu of available fixes ──────────────────────────────────────

  type FixId = 'ignorefile' | 'claudemd' | 'cache' | 'hooks';

  interface FixOption {
    id: FixId;
    label: string;
    detail: string;
    available: boolean;
  }

  const fixes: FixOption[] = [
    {
      id: 'ignorefile',
      label: 'Generate .claudeignore',
      detail: 'Prevents Claude from reading node_modules/, dist/, .git/, etc.',
      available: hasWarning('MISSING_IGNOREFILE') || !!options.ignorefile,
    },
    {
      id: 'claudemd',
      label: `Split CLAUDE.md into @files`,
      detail: `Extract large sections to demand-loaded files (saves tokens per request)`,
      available: hasWarning('OVERSIZED_CLAUDEMD') || !!options.claudemd,
    },
    {
      id: 'cache',
      label: 'Remove cache-busting content',
      detail: 'Comment-out dynamic dates/timestamps that bust the prompt cache every request',
      available: hasWarning('CACHE_BUSTING_CONTENT') || !!options.cache,
    },
    {
      id: 'hooks',
      label: 'Install session hooks',
      detail: 'Track per-file token spend via PostToolUse hook in .claude/settings.local.json',
      available: !isAlreadyInstalled(projectPath) || !!options.hooks,
    },
  ];

  const eligible = fixes.filter((f) => f.available);

  if (eligible.length === 0 && !specificMode) {
    logger.success(
      'Nothing to optimize! Run `claudectx analyze` to see the current token breakdown.'
    );
    return;
  }

  // ── Select which fixes to run ───────────────────────────────────────────────

  let selected: FixId[];

  if (specificMode) {
    // Honour explicit flags
    selected = (
      [
        options.ignorefile && 'ignorefile',
        options.claudemd && 'claudemd',
        options.cache && 'cache',
        options.hooks && 'hooks',
      ] as (FixId | false)[]
    ).filter((x): x is FixId => !!x);
  } else if (autoApply || dryRun) {
    selected = eligible.map((f) => f.id);
  } else {
    selected = await checkbox<FixId>({
      message: 'Which optimizations would you like to apply?',
      choices: eligible.map((f) => ({
        name: `${chalk.white(f.label)}  ${chalk.dim('—')}  ${chalk.dim(f.detail)}`,
        value: f.id,
        checked: true,
      })),
    });
  }

  if (selected.length === 0) {
    logger.info('Nothing selected — no changes made.');
    return;
  }

  // ── Run each selected fix ───────────────────────────────────────────────────

  for (const id of selected) {
    switch (id) {
      case 'ignorefile':
        await runIgnorefile(projectPath, dryRun, autoApply);
        break;
      case 'claudemd':
        await runClaudeMdSplit(projectPath, report, dryRun, autoApply);
        break;
      case 'cache':
        await runCacheOptimization(projectPath, dryRun, autoApply);
        break;
      case 'hooks':
        await runHooks(projectPath, dryRun, autoApply);
        break;
    }
  }

  // ── Footer ─────────────────────────────────────────────────────────────────

  console.log('');
  if (dryRun) {
    logger.warn('Dry run complete. Re-run without --dry-run to apply changes.');
  } else {
    logger.success('Optimization complete! Run `claudectx analyze` to verify your savings.');
  }
}

// ─── .claudeignore ────────────────────────────────────────────────────────────

async function runIgnorefile(
  projectRoot: string,
  dryRun: boolean,
  autoApply: boolean
): Promise<void> {
  printSectionHeader('.claudeignore');

  const result = generateIgnorefile(projectRoot);

  if (result.existed) {
    logger.warn('.claudeignore already exists — new patterns will be appended.');
  } else {
    logger.info(`Will create: ${chalk.cyan(result.filePath)}`);
  }

  logger.info(
    `Detected project types: ${result.projectTypes.length ? result.projectTypes.join(', ') : 'generic'}`
  );

  if (dryRun) {
    console.log(chalk.dim('\nPreview (first 20 lines):'));
    console.log(
      chalk.dim(result.content.split('\n').slice(0, 20).join('\n') + '\n  ...')
    );
    return;
  }

  const ok =
    autoApply ||
    (await confirm({
      message: result.existed
        ? 'Append patterns to existing .claudeignore?'
        : 'Create .claudeignore?',
      default: true,
    }));

  if (!ok) {
    logger.info('Skipped.');
    return;
  }

  writeIgnorefile(result);
  logger.success(`${result.existed ? 'Updated' : 'Created'} ${chalk.cyan(result.filePath)}`);
}

// ─── CLAUDE.md splitter ───────────────────────────────────────────────────────

async function runClaudeMdSplit(
  projectRoot: string,
  report: AnalysisReport,
  dryRun: boolean,
  autoApply: boolean
): Promise<void> {
  printSectionHeader('CLAUDE.md → @files');

  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath)) {
    logger.warn('No CLAUDE.md found — skipping.');
    return;
  }

  const content = fs.readFileSync(claudeMdPath, 'utf-8');
  const sections = parseSections(content);
  const largeSections = sections.filter(
    (s) => !s.isPreamble && s.tokens >= SPLIT_MIN_TOKENS
  );

  if (largeSections.length === 0) {
    logger.info(`No sections exceed ${SPLIT_MIN_TOKENS} tokens — nothing to extract.`);
    return;
  }

  // Show current usage from the report
  const claudeMdWarning = report.warnings.find((w) => w.code === 'OVERSIZED_CLAUDEMD');
  if (claudeMdWarning) {
    logger.warn(claudeMdWarning.message);
  }

  console.log('\n  Large sections found:');
  for (const s of largeSections) {
    console.log(`    ${chalk.yellow('•')} ${s.title}  ${chalk.dim(`(${s.tokens} tokens)`)}`);
  }

  let sectionsToExtract: string[];

  if (autoApply || dryRun) {
    sectionsToExtract = largeSections.map((s) => s.title);
  } else {
    sectionsToExtract = await checkbox<string>({
      message: 'Select sections to extract into .claude/ @files:',
      choices: largeSections.map((s) => ({
        name: `${s.title}  ${chalk.dim(`— ${s.tokens} tokens`)}`,
        value: s.title,
        checked: true,
      })),
    });
  }

  if (sectionsToExtract.length === 0) {
    logger.info('Skipped.');
    return;
  }

  const splitResult = planSplit(claudeMdPath, sectionsToExtract);

  if (dryRun) {
    console.log(
      chalk.dim(
        `\nWould extract ${splitResult.extractedFiles.length} section(s) to .claude/`
      )
    );
    for (const f of splitResult.extractedFiles) {
      console.log(chalk.dim(`  → ${f.refPath}  (${f.sectionTitle})`));
    }
    console.log(chalk.dim(`  Estimated savings: ~${splitResult.tokensSaved} tokens/request`));
    return;
  }

  const ok =
    autoApply ||
    (await confirm({
      message: `Extract ${sectionsToExtract.length} section(s) and update CLAUDE.md?`,
      default: true,
    }));

  if (!ok) {
    logger.info('Skipped.');
    return;
  }

  applySplit(splitResult);
  logger.success(
    `Extracted ${splitResult.extractedFiles.length} section(s). Saved ~${splitResult.tokensSaved} tokens/request.`
  );
  for (const f of splitResult.extractedFiles) {
    logger.info(`  Created: ${chalk.cyan(path.relative(projectRoot, f.filePath))}`);
  }
}

// ─── Cache optimisation ───────────────────────────────────────────────────────

async function runCacheOptimization(
  projectRoot: string,
  dryRun: boolean,
  autoApply: boolean
): Promise<void> {
  printSectionHeader('Prompt cache optimisation');

  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath)) {
    logger.warn('No CLAUDE.md found — skipping.');
    return;
  }

  const result = planCacheFixes(claudeMdPath);

  if (result.fixes.length === 0) {
    logger.success('No cache-busting patterns found in CLAUDE.md.');
    return;
  }

  console.log(`\n  ${result.fixes.length} cache-busting line(s) detected:\n`);
  for (const fix of result.fixes) {
    console.log(
      `    ${chalk.dim(`line ${fix.lineNumber}:`)}  ${chalk.red(fix.originalLine.trim())}`
    );
    console.log(`    ${chalk.dim('→')}  ${chalk.green(fix.fixedLine)}`);
    console.log('');
  }

  if (dryRun) return;

  const ok =
    autoApply ||
    (await confirm({
      message: `Comment-out ${result.fixes.length} cache-busting line(s)?`,
      default: true,
    }));

  if (!ok) {
    logger.info('Skipped.');
    return;
  }

  applyAndWriteCacheFixes(claudeMdPath, result);
  logger.success(`Fixed ${result.fixes.length} cache-busting pattern(s) in CLAUDE.md.`);
}

// ─── Hooks installer ──────────────────────────────────────────────────────────

async function runHooks(
  projectRoot: string,
  dryRun: boolean,
  autoApply: boolean
): Promise<void> {
  printSectionHeader('Session hooks');

  const result = planHooksInstall(projectRoot);

  logger.info(
    `Settings file: ${chalk.cyan(path.relative(projectRoot, result.settingsPath))}`
  );
  logger.info(result.existed ? 'Will merge with existing settings.' : 'Will create new file.');
  console.log(chalk.dim('\n  Hooks to install:'));
  console.log(
    chalk.dim('    • PostToolUse → Read: track per-file token spend for `claudectx watch`')
  );

  if (dryRun) return;

  const ok =
    autoApply ||
    (await confirm({ message: 'Install claudectx session hooks?', default: true }));

  if (!ok) {
    logger.info('Skipped.');
    return;
  }

  applyHooksInstall(result);
  logger.success(
    `Hooks installed → ${chalk.cyan(path.relative(projectRoot, result.settingsPath))}`
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function printSectionHeader(title: string): void {
  console.log('');
  console.log(chalk.bold.cyan(`── ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}`));
}
