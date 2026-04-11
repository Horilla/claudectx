// Phase 3 — coming in v0.3.0
export async function watchCommand(_options: Record<string, unknown>): Promise<void> {
  const chalk = (await import('chalk')).default;
  process.stdout.write(chalk.yellow('claudectx watch (live dashboard) is coming in v0.3.0\n'));
}
