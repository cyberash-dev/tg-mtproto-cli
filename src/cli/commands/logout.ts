import chalk from "chalk";
import type { Command } from "commander";
import type { LogoutUseCase } from "../../use-cases/logout.js";
import { exitWithError } from "../errors.js";

export function registerLogoutCommand(program: Command, logoutUseCase: LogoutUseCase) {
  program
    .command("logout [alias]")
    .description("Log out from a Telegram account")
    .action(async (alias?: string) => {
      try {
        const { account, othersExist } = await logoutUseCase.execute(alias);
        const name = account.lastName ? `${account.firstName} ${account.lastName}` : account.firstName;
        console.log(chalk.green(`Logged out from "${account.alias}" (${account.phone}, ${name})`));

        if (account.isDefault && othersExist) {
          console.log(chalk.yellow(`No default account set. Use 'tg default <alias>' to set one.`));
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        exitWithError(program, message, message.includes("No accounts") ? 2 : 1);
      }
    });
}
