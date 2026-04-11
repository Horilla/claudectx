import * as path from 'path';
import chalk from 'chalk';
import { logger } from '../shared/logger.js';
import { planInstall, applyInstall, isInstalled } from '../mcp/installer.js';

interface McpOptions {
  port?: string;
  install?: boolean;
  path?: string;
}

export async function mcpCommand(options: McpOptions): Promise<void> {
  const projectRoot = options.path ? path.resolve(options.path) : process.cwd();

  // ── Install mode ─────────────────────────────────────────────────────────
  if (options.install) {
    await runInstall(projectRoot);
    return;
  }

  // ── Server mode ───────────────────────────────────────────────────────────
  // HTTP transport (--port) is planned for a future release.
  if (options.port) {
    process.stderr.write(
      chalk.yellow(
        `HTTP transport (--port) is coming in a future release.\n` +
          `Starting stdio server instead.\n`
      )
    );
  }

  // Auto-suggest install if not yet done
  if (!isInstalled(projectRoot)) {
    process.stderr.write(
      chalk.dim(
        `Tip: run "claudectx mcp --install" to add this server to .claude/settings.json\n`
      )
    );
  }

  const { startMcpServer } = await import('../mcp/server.js');
  await startMcpServer();
}

async function runInstall(projectRoot: string): Promise<void> {
  const result = planInstall(projectRoot);

  if (result.alreadyInstalled) {
    logger.success(
      `claudectx MCP server is already registered in ${chalk.cyan(result.settingsPath)}`
    );
    return;
  }

  logger.info(`Adding claudectx MCP server to ${chalk.cyan(result.settingsPath)} ...`);
  applyInstall(result);

  logger.success('MCP server installed!');
  console.log('');
  console.log(chalk.dim('  Claude Code will pick it up on next restart.'));
  console.log(chalk.dim('  Tools available to Claude:'));
  console.log(chalk.dim('    • smart_read       — read a symbol instead of a whole file'));
  console.log(chalk.dim('    • search_symbols   — search for symbols by name'));
  console.log(chalk.dim('    • index_project    — build the symbol index'));
  console.log('');
  console.log(chalk.dim(`  Settings file: ${result.settingsPath}`));
}
