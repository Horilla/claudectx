import * as path from 'path';
import { findProjectRoot } from '../analyzer/context-parser.js';
import { estimateBudget, formatBudgetReport } from '../analyzer/budget-estimator.js';
import { resolveModel } from '../shared/models.js';

export interface BudgetOptions {
  path?: string;
  model?: string;
  threshold?: string;
  json?: boolean;
}

export async function budgetCommand(globs: string[], options: BudgetOptions): Promise<void> {
  const projectPath = options.path ? path.resolve(options.path) : process.cwd();
  const projectRoot = findProjectRoot(projectPath) ?? projectPath;
  const model = resolveModel(options.model ?? 'sonnet');
  const thresholdTokens = parseInt(options.threshold ?? '10000', 10);

  if (globs.length === 0) {
    process.stderr.write('Error: at least one glob pattern is required.\n');
    process.stderr.write('Example: claudectx budget "src/**/*.ts"\n');
    process.exit(1);
  }

  const report = await estimateBudget(globs, projectRoot, model, thresholdTokens);

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }

  process.stdout.write(formatBudgetReport(report));
}
