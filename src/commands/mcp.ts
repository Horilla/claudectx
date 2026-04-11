// Phase 4 — coming in v0.4.0
export async function mcpCommand(_options: Record<string, unknown>): Promise<void> {
  const chalk = (await import('chalk')).default;
  process.stdout.write(chalk.yellow('claudectx mcp (smart MCP server) is coming in v0.4.0\n'));
}
