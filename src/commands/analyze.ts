import path from 'path';
import chalk from 'chalk';
import boxen from 'boxen';
import Table from 'cli-table3';
import { ContextAnalyzer } from '../analyzer/index.js';
import { resolveModel } from '../shared/models.js';
import { formatCost } from '../analyzer/cost-calculator.js';
import type { AnalysisReport, ContextComponent } from '../shared/types.js';

interface AnalyzeOptions {
  path?: string;
  json?: boolean;
  model?: string;
  watch?: boolean;
}

function statusIcon(component: ContextComponent): string {
  if (component.warnings.length === 0) return chalk.green('✓');
  const hasError = component.warnings.some((w) => w.severity === 'error');
  if (hasError) return chalk.red('✖');
  return chalk.yellow('⚠');
}

function renderReport(report: AnalysisReport): void {
  const contextPct = ((report.totalTokensPerRequest / 200_000) * 100).toFixed(1);

  // Header box
  const header = [
    chalk.bold('claudectx — Context Analysis'),
    chalk.dim(`Project: ${report.projectPath}`),
    '',
    `${chalk.bold('Tokens/request:')} ${chalk.cyan(report.totalTokensPerRequest.toLocaleString())}   ${chalk.bold('Session cost:')} ${chalk.yellow(formatCost(report.estimatedCostPerSession))}`,
    `${chalk.bold('Model:')} ${report.model}   ${chalk.bold('Context used:')} ${contextPct}% of 200K window`,
  ].join('\n');

  process.stdout.write(
    boxen(header, {
      padding: 1,
      borderStyle: 'double',
      borderColor: 'cyan',
    }) + '\n\n',
  );

  // Component table
  const table = new Table({
    head: [
      chalk.bold('Component'),
      chalk.bold('Tokens'),
      chalk.bold('Cost/req'),
      chalk.bold('Status'),
    ],
    colWidths: [38, 12, 12, 10],
    style: { head: [], border: [] },
  });

  for (const c of report.components) {
    table.push([
      c.name,
      c.tokenCount.toLocaleString(),
      formatCost(c.estimatedCostPerRequest),
      statusIcon(c),
    ]);
  }

  // Total row
  table.push([
    chalk.bold('TOTAL (per request)'),
    chalk.bold(report.totalTokensPerRequest.toLocaleString()),
    chalk.bold(formatCost(report.components.reduce((s, c) => s + c.estimatedCostPerRequest, 0))),
    '',
  ]);

  process.stdout.write(table.toString() + '\n');

  // Warnings
  if (report.warnings.length === 0) {
    process.stdout.write('\n' + chalk.green('✔ No optimization opportunities found. Looking good!\n'));
  } else {
    process.stdout.write(
      '\n' + chalk.yellow(`⚠  ${report.warnings.length} optimization ${report.warnings.length === 1 ? 'opportunity' : 'opportunities'} found:\n\n`),
    );

    report.warnings.forEach((w, i) => {
      const icon =
        w.severity === 'error' ? chalk.red('✖') : w.severity === 'warning' ? chalk.yellow('⚠') : chalk.blue('ℹ');
      const lineInfo = w.lineNumber ? ` (line ${w.lineNumber})` : '';
      process.stdout.write(`  ${chalk.bold(`[${i + 1}]`)} ${icon} ${w.message}${lineInfo}\n`);
      process.stdout.write(`      ${chalk.dim('→')} ${w.suggestion}\n`);
      if (w.estimatedSavings > 0) {
        process.stdout.write(
          `      ${chalk.dim('→')} Potential savings: ~${w.estimatedSavings.toLocaleString()} tokens/request\n`,
        );
      }
      process.stdout.write('\n');
    });

    process.stdout.write(
      chalk.dim(
        `  💡 Run ${chalk.cyan('claudectx optimize')} to fix all issues automatically.\n` +
          `  💡 Run ${chalk.cyan('claudectx optimize --dry-run')} to preview changes first.\n`,
      ) + '\n',
    );
  }

  if (report.potentialSavingsPercent > 0) {
    process.stdout.write(
      chalk.dim(
        `  Potential savings: ${report.potentialSavingsPercent}% (${(report.totalTokensPerRequest - report.optimizedTokensPerRequest).toLocaleString()} tokens)\n\n`,
      ),
    );
  }

  process.stdout.write(
    chalk.dim('  ⭐ If claudectx saved you money, star the repo: https://github.com/Horilla/claudectx\n\n'),
  );
}

export async function analyzeCommand(options: AnalyzeOptions): Promise<void> {
  const targetPath = path.resolve(options.path ?? process.cwd());
  const model = resolveModel(options.model ?? 'sonnet');
  const analyzer = new ContextAnalyzer(model);

  async function run() {
    try {
      const report = await analyzer.analyze(targetPath);

      if (options.json) {
        process.stdout.write(JSON.stringify(report, null, 2) + '\n');
        return;
      }

      renderReport(report);
    } catch (err) {
      process.stderr.write(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}\n`));
      process.exit(1);
    }
  }

  await run();

  if (options.watch) {
    const { watch } = await import('fs');
    process.stderr.write(chalk.dim('Watching for changes (Ctrl+C to stop)...\n'));

    let debounce: ReturnType<typeof setTimeout> | null = null;
    watch(targetPath, { recursive: true }, (_event, filename) => {
      if (!filename?.includes('CLAUDE') && !filename?.includes('MEMORY')) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(async () => {
        process.stdout.write('\x1Bc'); // clear terminal
        process.stderr.write(chalk.dim(`Re-analyzing after change to ${filename}...\n\n`));
        await run();
      }, 300);
    });

    // Keep process alive
    await new Promise(() => {});
  }
}
