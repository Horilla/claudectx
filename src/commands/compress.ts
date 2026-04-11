// Phase 5 — coming in v0.5.0
export async function compressCommand(_options: Record<string, unknown>): Promise<void> {
  const chalk = (await import('chalk')).default;
  process.stdout.write(chalk.yellow('claudectx compress is coming in v0.5.0\n'));
}
