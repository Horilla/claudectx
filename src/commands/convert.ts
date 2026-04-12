import * as fs from 'fs';
import * as path from 'path';
import { findProjectRoot } from '../analyzer/context-parser.js';

export interface ConvertOptions {
  path?: string;
  from?: string;
  to: string;
  dryRun?: boolean;
}

export interface ConvertedFile {
  filename: string;
  content: string;
}

/** Slugify a section header for use as a filename */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Split CLAUDE.md into Cursor .mdc rule files.
 * Each ## Section becomes a separate .cursor/rules/<slug>.mdc file.
 */
export function claudeMdToCursorRules(content: string): ConvertedFile[] {
  const files: ConvertedFile[] = [];
  const lines = content.split('\n');

  let currentHeader = '';
  let currentBody: string[] = [];

  function flushSection() {
    if (!currentHeader) return;
    const slug = slugify(currentHeader);
    if (!slug) return;
    const mdc = [
      '---',
      `description: ${currentHeader}`,
      'alwaysApply: true',
      '---',
      '',
      ...currentBody,
    ].join('\n');
    files.push({ filename: `${slug}.mdc`, content: mdc });
  }

  for (const line of lines) {
    const match = line.match(/^##\s+(.+)$/);
    if (match) {
      flushSection();
      currentHeader = match[1];
      currentBody = [];
    } else if (currentHeader) {
      currentBody.push(line);
    }
    // Lines before the first ## header are ignored (top-level intro content)
  }
  flushSection();

  // If no ## sections found, output everything as a single file
  if (files.length === 0 && content.trim()) {
    files.push({
      filename: 'project-instructions.mdc',
      content: ['---', 'description: Project Instructions', 'alwaysApply: true', '---', '', content].join('\n'),
    });
  }

  return files;
}

/**
 * Convert CLAUDE.md to a GitHub Copilot instructions file.
 * Strips ## headers and joins bodies into plain Markdown.
 */
export function claudeMdToCopilot(content: string): string {
  // For Copilot, just clean up @references and emit as-is (it reads plain markdown)
  return content
    .split('\n')
    .filter((line) => !line.match(/^@.+$/)) // strip @file references (Copilot doesn't support them)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n') // normalize extra blank lines
    .trim();
}

/**
 * Convert CLAUDE.md to a Windsurf rules file.
 * Strips @references; Windsurf reads plain text.
 */
export function claudeMdToWindsurf(content: string): string {
  return content
    .split('\n')
    .filter((line) => !line.match(/^@.+$/))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function convertCommand(options: ConvertOptions): Promise<void> {
  const projectPath = options.path ? path.resolve(options.path) : process.cwd();
  const projectRoot = findProjectRoot(projectPath) ?? projectPath;
  const from = options.from ?? 'claude';
  const to = options.to;

  if (from !== 'claude') {
    process.stderr.write(`Error: --from "${from}" is not yet supported. Only --from claude is available.\n`);
    process.exit(1);
  }

  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
  let content = '';
  try {
    content = fs.readFileSync(claudeMdPath, 'utf-8');
  } catch {
    process.stderr.write(`Error: CLAUDE.md not found at ${claudeMdPath}\n`);
    process.exit(1);
  }

  if (to === 'cursor') {
    const files = claudeMdToCursorRules(content);
    const targetDir = path.join(projectRoot, '.cursor', 'rules');

    process.stdout.write(`\nConverting CLAUDE.md → ${files.length} Cursor rule file(s)\n\n`);

    for (const file of files) {
      const filePath = path.join(targetDir, file.filename);
      const exists = fs.existsSync(filePath);
      const prefix = options.dryRun ? '[dry-run] ' : exists ? '[overwrite] ' : '';
      process.stdout.write(`  ${prefix}→ .cursor/rules/${file.filename}\n`);
      if (!options.dryRun) {
        fs.mkdirSync(targetDir, { recursive: true });
        fs.writeFileSync(filePath, file.content, 'utf-8');
      }
    }
    process.stdout.write('\n');

  } else if (to === 'copilot') {
    const converted = claudeMdToCopilot(content);
    const targetPath = path.join(projectRoot, '.github', 'copilot-instructions.md');
    const exists = fs.existsSync(targetPath);
    process.stdout.write(`\nConverting CLAUDE.md → .github/copilot-instructions.md${exists ? ' [overwrite]' : ''}\n`);
    if (!options.dryRun) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, converted, 'utf-8');
      process.stdout.write(`  ✓ Written to ${targetPath}\n\n`);
    } else {
      process.stdout.write(`  [dry-run] Would write ${converted.length} chars to ${targetPath}\n\n`);
    }

  } else if (to === 'windsurf') {
    const converted = claudeMdToWindsurf(content);
    const targetPath = path.join(projectRoot, '.windsurfrules');
    const exists = fs.existsSync(targetPath);
    process.stdout.write(`\nConverting CLAUDE.md → .windsurfrules${exists ? ' [overwrite]' : ''}\n`);
    if (!options.dryRun) {
      fs.writeFileSync(targetPath, converted, 'utf-8');
      process.stdout.write(`  ✓ Written to ${targetPath}\n\n`);
    } else {
      process.stdout.write(`  [dry-run] Would write ${converted.length} chars to ${targetPath}\n\n`);
    }

  } else {
    process.stderr.write(`Error: unknown target "${to}". Use: cursor | copilot | windsurf\n`);
    process.exit(1);
  }
}
