import * as path from 'path';
import * as fs from 'fs';
import { resolveModel } from '../shared/models.js';
import { formatCost } from '../analyzer/cost-calculator.js';
import {
  buildTeamExport,
  aggregateTeamReports,
  writeTeamExport,
  readTeamExports,
  anonymizeExport,
} from '../reporter/team-aggregator.js';
import { getStoreDir } from '../watcher/session-store.js';

export interface TeamsOptions {
  days?: string;
  model?: string;
  anonymize?: boolean;
  dir?: string;
  to?: string;
  json?: boolean;
  name?: string;
}

export async function teamsExport(options: TeamsOptions): Promise<void> {
  const model = resolveModel(options.model ?? 'sonnet');
  const days = parseInt(options.days ?? '30', 10);
  const anonymize = options.anonymize ?? false;

  const exportData = await buildTeamExport(days, model, anonymize);

  if (options.json) {
    process.stdout.write(JSON.stringify(exportData, null, 2) + '\n');
    return;
  }

  const filePath = writeTeamExport(exportData);
  process.stdout.write('\n');
  process.stdout.write(`claudectx teams export\n`);
  process.stdout.write('═'.repeat(45) + '\n');
  process.stdout.write(`  Developer:    ${exportData.developer.identity}\n`);
  process.stdout.write(`  Period:       Last ${days} days\n`);
  process.stdout.write(`  Sessions:     ${exportData.developer.sessionCount}\n`);
  process.stdout.write(`  Total cost:   ${formatCost(exportData.developer.totalCostUsd)}\n`);
  process.stdout.write(`  Cache rate:   ${exportData.developer.cacheHitRate}%\n`);
  process.stdout.write(`\n  ✓ Saved to: ${filePath}\n`);
  process.stdout.write('  Share this file with your team lead for aggregation.\n\n');
}

export async function teamsAggregate(options: TeamsOptions): Promise<void> {
  const dir = options.dir ?? getStoreDir();
  const anonymize = options.anonymize ?? false;

  const exports = readTeamExports(dir);
  if (exports.length === 0) {
    process.stderr.write(
      `No team export files found in ${dir}.\n` +
        `Run "claudectx teams export" on each developer machine first.\n`,
    );
    process.exit(1);
  }

  const anonymized = anonymize
    ? exports.map((e, i) => anonymizeExport(e, i))
    : exports;

  const report = aggregateTeamReports(anonymized);

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return;
  }

  process.stdout.write('\n');
  process.stdout.write('claudectx teams aggregate — team cost report\n');
  process.stdout.write('═'.repeat(55) + '\n');
  process.stdout.write(`  Developers:       ${report.totalDevelopers}\n`);
  process.stdout.write(`  Period:           Last ${report.periodDays} days\n`);
  process.stdout.write(`  Team total cost:  ${formatCost(report.teamTotalCostUsd)}\n`);
  process.stdout.write(`  Team cache rate:  ${report.teamCacheHitRate}%\n`);
  process.stdout.write('\n');

  process.stdout.write(
    `  ${'Developer'.padEnd(30)}  ${'Cost'.padStart(8)}  ${'Cache'.padStart(6)}  Sessions\n`,
  );
  process.stdout.write('─'.repeat(55) + '\n');
  for (const dev of report.developers) {
    const identity = dev.identity.slice(0, 30).padEnd(30);
    const cost = formatCost(dev.totalCostUsd).padStart(8);
    const cache = `${dev.cacheHitRate}%`.padStart(6);
    const sessions = String(dev.sessionCount).padStart(8);
    process.stdout.write(`  ${identity}  ${cost}  ${cache}  ${sessions}\n`);
  }
  process.stdout.write('\n');

  if (report.topWasteFiles.length > 0) {
    process.stdout.write('  Top shared files (by read count across team):\n');
    for (const f of report.topWasteFiles.slice(0, 5)) {
      const devList = f.developers.slice(0, 3).join(', ');
      process.stdout.write(`    ${f.readCount}x  ${path.basename(f.filePath)}  (${devList})\n`);
    }
    process.stdout.write('\n');
  }
}

export async function teamsShare(options: TeamsOptions): Promise<void> {
  const dest = options.to;
  if (!dest) {
    process.stderr.write('Usage: claudectx teams share --to <path>\n');
    process.exit(1);
  }

  const storeDir = getStoreDir();
  const exportFiles = fs
    .readdirSync(storeDir)
    .filter((f) => f.match(/^team-export-.*\.json$/))
    .sort()
    .reverse();

  if (exportFiles.length === 0) {
    process.stderr.write('No team export files found. Run "claudectx teams export" first.\n');
    process.exit(1);
  }

  const latest = exportFiles[0];
  const src = path.join(storeDir, latest);
  const destPath = fs.statSync(dest).isDirectory() ? path.join(dest, latest) : dest;

  fs.copyFileSync(src, destPath);
  process.stdout.write(`  ✓ Copied ${latest} → ${destPath}\n\n`);
}

export async function teamsCommand(
  subcommand: string,
  options: TeamsOptions,
): Promise<void> {
  switch (subcommand) {
    case 'export':
      await teamsExport(options);
      break;
    case 'aggregate':
      await teamsAggregate(options);
      break;
    case 'share':
      await teamsShare(options);
      break;
    default:
      process.stderr.write(
        `Unknown sub-command "${subcommand}". Use: export | aggregate | share\n`,
      );
      process.exit(1);
  }
}
