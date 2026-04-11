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
  .description('Start smart MCP server with symbol-level file reading (coming in v0.4.0)')
  .option('--port <port>', 'Use HTTP transport on specified port (default: stdio)')
  .option('--install', 'Auto-add to .claude/settings.json')
  .action(async (options) => {
    await mcpCommand(options);
  });

// ─── compress ─────────────────────────────────────────────────────────────────
program
  .command('compress')
  .alias('c')
  .description('Compress session into a minimal MEMORY.md entry (coming in v0.5.0)')
  .option('--session <id>', 'Compress specific session ID')
  .option('--auto', 'Non-interactive mode (for hooks)')
  .option('--max-tokens <n>', 'Max size of compressed entry', '200')
  .option('--prune', 'Also prune old MEMORY.md entries')
  .option('--days <n>', 'Days threshold for pruning', '30')
  .action(async (options) => {
    await compressCommand(options);
  });

// ─── report ───────────────────────────────────────────────────────────────────
program
  .command('report')
  .alias('r')
  .description('Usage analytics report (coming in v0.5.0)')
  .option('--days <n>', 'Number of days to report on', '7')
  .option('--json', 'JSON output')
  .option('--markdown', 'Markdown output')
  .action(async (options) => {
    await reportCommand(options);
  });

program.parse();
