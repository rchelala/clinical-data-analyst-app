import chalk from 'chalk';

export const log = {
  info: (msg: string) => console.log(chalk.blue('i'), msg),
  step: (current: number, total: number, msg: string) =>
    console.log(chalk.cyan(`[${current}/${total}]`), msg),
  done: (msg: string) => console.log(chalk.green('done'), msg),
  warn: (msg: string) => console.log(chalk.yellow('warn'), msg),
  error: (msg: string) => console.error(chalk.red('error'), msg),
};
