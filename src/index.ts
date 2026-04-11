import { Command } from 'commander';
import { analyzeCommand } from './commands/analyze.js';
import { optimizeCommand } from './commands/optimize.js';
import { watchCommand } from './commands/watch.js';
import { mcpCommand } from './commands/mcp.js';
import { compressCommand } from './commands/compress.js';
import { reportCommand } from './commands/report.js';

// Version injected at build time by tsup via package.json
const VERSION = '0.1.0';
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

program.parse();
