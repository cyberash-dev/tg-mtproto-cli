import chalk from "chalk";
import type { Command } from "commander";
import type { AccountsListUseCase } from "../../use-cases/accounts-list.js";
import type { AccountsRenameUseCase } from "../../use-cases/accounts-rename.js";
import { exitWithError } from "../errors.js";
import { formatAccountsJson, formatAccountsTable } from "../formatters/account-formatter.js";

export function registerAccountsCommand(
  program: Command,
  accountsListUseCase: AccountsListUseCase,
  accountsRenameUseCase: AccountsRenameUseCase,
) {
  const accountsCmd = program.command("accounts").description("Manage accounts");

  accountsCmd
    .command("list", { isDefault: true })
    .description("List all logged-in accounts")
    .action(async () => {
      try {
        const accounts = await accountsListUseCase.execute();
        const json = program.opts().json;
        console.log(json ? formatAccountsJson(accounts) : formatAccountsTable(accounts));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        exitWithError(program, message, 1);
      }
    });

  accountsCmd
    .command("rename <old> <new>")
    .description("Rename an account alias")
    .action(async (oldAlias: string, newAlias: string) => {
      try {
        await accountsRenameUseCase.execute(oldAlias, newAlias);
        console.log(chalk.green(`Account alias renamed: "${oldAlias}" -> "${newAlias}"`));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        exitWithError(program, message, 1);
      }
    });
}
