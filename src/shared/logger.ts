import chalk from 'chalk';

export const logger = {
  info: (msg: string) => process.stderr.write(chalk.blue('ℹ ') + msg + '\n'),
  warn: (msg: string) => process.stderr.write(chalk.yellow('⚠ ') + msg + '\n'),
  error: (msg: string) => process.stderr.write(chalk.red('✖ ') + msg + '\n'),
  success: (msg: string) => process.stderr.write(chalk.green('✔ ') + msg + '\n'),
  dim: (msg: string) => process.stderr.write(chalk.dim(msg) + '\n'),
};
