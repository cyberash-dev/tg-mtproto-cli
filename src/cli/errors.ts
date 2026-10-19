import { stripVTControlCharacters } from "node:util";
import chalk from "chalk";
import type { Command } from "commander";

export function errorJson(message: string, code: number): string {
  return JSON.stringify({ error: stripVTControlCharacters(message), code });
}

export function exitWithError(program: Command, message: string, code: number): never {
  const { json } = program.opts<{ json?: boolean }>();
  console.error(json ? errorJson(message, code) : chalk.red(message));
  process.exit(code);
}
