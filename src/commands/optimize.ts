// Phase 2 — coming in v0.2.0
export async function optimizeCommand(_options: Record<string, unknown>): Promise<void> {
  const chalk = (await import('chalk')).default;
  process.stdout.write(chalk.yellow('claudectx optimize is coming in v0.2.0\n'));
  process.stdout.write(chalk.dim('Run `claudectx analyze` first to see what needs fixing.\n'));
}
