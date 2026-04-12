import { Command } from 'commander';
import { analyzeCommand } from './commands/analyze.js';
import { optimizeCommand } from './commands/optimize.js';
import { watchCommand } from './commands/watch.js';
import { mcpCommand } from './commands/mcp.js';
import { compressCommand } from './commands/compress.js';
import { reportCommand } from './commands/report.js';
import { budgetCommand } from './commands/budget.js';
import { warmupCommand } from './commands/warmup.js';
import { driftCommand } from './commands/drift.js';
import { hooksCommand } from './commands/hooks.js';
import { convertCommand } from './commands/convert.js';
import { teamsCommand } from './commands/teams.js';
import { revertCommand } from './commands/revert.js';

// Version injected at build time by tsup via package.json
const VERSION = '1.1.4';
const DESCRIPTION = 'Reduce Claude Code token usage by up to 80%. Context analyzer, auto-optimizer, live dashboard, and smart MCP tools.';

const program = new Command();

program
  .name('claudectx')
  .description(DESCRIPTION)
  .version(VERSION);

// ─── analyze ──────────────────────────────────────────────────────────────────
program
  .command('analyze')
  .alias('a')
  .description('Analyze token usage in the current Claude Code project')
  .option('-p, --path <path>', 'Path to project directory (default: cwd)')
  .option('-j, --json', 'Output raw JSON (for scripting)')
  .option('-m, --model <model>', 'Claude model to estimate costs for (haiku|sonnet|opus)', 'sonnet')
  .option('-w, --watch', 'Re-run analysis on CLAUDE.md / MEMORY.md changes')
  .action(async (options) => {
    await analyzeCommand(options);
  });

// ─── optimize ─────────────────────────────────────────────────────────────────
program
  .command('optimize')
  .alias('o')
  .description('Auto-fix token waste issues in CLAUDE.md, .claudeignore, and hooks')
  .option('-p, --path <path>', 'Path to project directory (default: cwd)')
  .option('--apply', 'Apply all fixes without prompting')
  .option('--dry-run', 'Preview changes without applying')
  .option('--claudemd', 'Only optimize CLAUDE.md (split into @files)')
  .option('--ignorefile', 'Only generate .claudeignore')
  .option('--cache', 'Only fix cache-busting content')
  .option('--hooks', 'Only install session hooks')
  .option('--api-key <key>', 'Anthropic API key (for AI-powered CLAUDE.md rewriting)')
  .action(async (options) => {
    await optimizeCommand(options);
  });

// ─── watch ────────────────────────────────────────────────────────────────────
program
  .command('watch')
  .alias('w')
  .description('Live token-usage dashboard — tracks files read and session cost in real time')
  .option('--session <id>', 'Watch a specific session ID (default: most recent)')
  .option('-m, --model <model>', 'Model for cost estimates (haiku|sonnet|opus)', 'sonnet')
  .option('--log-stdin', 'Read hook JSON from stdin and log the file path (called by Claude Code hook)')
  .option('--clear', 'Clear the session file-read log and exit')
  .action(async (options) => {
    await watchCommand(options);
  });

// ─── mcp ──────────────────────────────────────────────────────────────────────
program
  .command('mcp')
  .description('Start the smart MCP server — symbol-level file reading for Claude Code')
  .option('-p, --path <path>', 'Project root (default: cwd)')
  .option('--port <port>', 'HTTP transport port (stdio is default; HTTP coming soon)')
  .option('--install', 'Add server to .claude/settings.json and exit')
  .action(async (options) => {
    await mcpCommand(options);
  });

// ─── compress ─────────────────────────────────────────────────────────────────
program
  .command('compress')
  .alias('c')
  .description('Compress a Claude Code session into a compact MEMORY.md entry')
  .option('-p, --path <path>', 'Project directory (default: cwd)')
  .option('--session <id>', 'Compress specific session ID (default: most recent)')
  .option('--auto', 'Non-interactive mode (for hooks)')
  .option('--prune', 'Also prune old MEMORY.md entries')
  .option('--days <n>', 'Days threshold for pruning (with --prune)', '30')
  .option('--api-key <key>', 'Anthropic API key for AI-powered summarization')
  .action(async (options) => {
    await compressCommand(options);
  });

// ─── report ───────────────────────────────────────────────────────────────────
program
  .command('report')
  .alias('r')
  .description('Show token usage analytics for the last N days')
  .option('-p, --path <path>', 'Project directory (default: cwd)')
  .option('--days <n>', 'Number of days to include', '7')
  .option('--json', 'Machine-readable JSON output')
  .option('--markdown', 'GitHub-flavoured Markdown output')
  .option('-m, --model <model>', 'Claude model for cost estimates (haiku|sonnet|opus)', 'sonnet')
  .action(async (options) => {
    await reportCommand(options);
  });

// ─── budget ───────────────────────────────────────────────────────────────────
program
  .command('budget <globs...>')
  .description('Estimate token cost before running a task')
  .option('-m, --model <model>', 'Model for cost estimates (haiku|sonnet|opus)', 'sonnet')
  .option('--threshold <n>', 'Warn if total exceeds N tokens', '10000')
  .option('-p, --path <path>', 'Project directory')
  .option('--json', 'JSON output')
  .action(async (globs: string[], options) => {
    await budgetCommand(globs, options);
  });

// ─── warmup ───────────────────────────────────────────────────────────────────
program
  .command('warmup')
  .description('Pre-warm the Anthropic prompt cache with your CLAUDE.md')
  .option('-m, --model <model>', 'Model (haiku|sonnet|opus)', 'haiku')
  .option('--ttl <minutes>', 'Cache TTL: 5 or 60', '5')
  .option('--cron <expr>', 'Install as cron job (e.g. "0 9 * * 1-5")')
  .option('--api-key <key>', 'Anthropic API key')
  .option('-p, --path <path>', 'Project directory')
  .option('--json', 'JSON output')
  .action(async (options) => {
    await warmupCommand(options);
  });

// ─── drift ────────────────────────────────────────────────────────────────────
program
  .command('drift')
  .description('Detect stale references and dead sections in CLAUDE.md')
  .option('-p, --path <path>', 'Project directory')
  .option('--days <n>', 'Days window for section usage', '30')
  .option('--fix', 'Interactively remove flagged lines')
  .option('--json', 'JSON output')
  .action(async (options) => {
    await driftCommand(options);
  });

// ─── hooks ────────────────────────────────────────────────────────────────────
program
  .command('hooks [subcommand] [name]')
  .description('Hook marketplace: list | add <name> | remove <name> | status')
  .option('-p, --path <path>', 'Project directory')
  .option('--config <pair...>', 'key=value config pairs for add')
  .action(async (subcommand: string | undefined, name: string | undefined, options) => {
    await hooksCommand(subcommand, { ...options, name });
  });

// ─── convert ──────────────────────────────────────────────────────────────────
program
  .command('convert')
  .description('Convert CLAUDE.md to another AI assistant format')
  .option('--from <assistant>', 'Source format (default: claude)', 'claude')
  .requiredOption('--to <assistant>', 'Target format: cursor | copilot | windsurf')
  .option('--dry-run', 'Preview without writing')
  .option('-p, --path <path>', 'Project directory')
  .action(async (options) => {
    await convertCommand(options);
  });

// ─── teams ────────────────────────────────────────────────────────────────────
program
  .command('teams [subcommand]')
  .description('Multi-developer cost attribution (export | aggregate | share)')
  .option('--days <n>', 'Days to include', '30')
  .option('-m, --model <model>', 'Model', 'sonnet')
  .option('--anonymize', 'Replace identities with Dev 1, Dev 2...')
  .option('--dir <path>', 'Directory with team export JSON files')
  .option('--to <path>', 'Destination for share sub-command')
  .option('--json', 'JSON output')
  .action(async (subcommand: string | undefined, options) => {
    await teamsCommand(subcommand ?? 'export', options);
  });

// ─── revert ───────────────────────────────────────────────────────────────────
program
  .command('revert')
  .description('List and restore backups created automatically by claudectx commands')
  .option('--list', 'Show all backups')
  .option('--id <id>', 'Restore a specific backup by ID')
  .option('--file <path>', 'Filter backups by original file path')
  .option('--json', 'JSON output')
  .action(async (options) => {
    await revertCommand(options);
  });

program.parse();
