import chalk from "chalk";
import type { Command } from "commander";
import type { SetDefaultAccountUseCase } from "../../use-cases/set-default-account.js";

export function registerDefaultCommand(program: Command, setDefaultUseCase: SetDefaultAccountUseCase) {
  program
    .command("default <alias>")
    .description("Set the default account")
    .action(async (alias: string) => {
      try {
        const account = await setDefaultUseCase.execute(alias);
        const name = account.lastName ? `${account.firstName} ${account.lastName}` : account.firstName;
        console.log(chalk.green(`Default account set to "${account.alias}" (${account.phone}, ${name})`));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("already the default")) {
          console.log(message);
          process.exit(0);
        }
        console.error(chalk.red(message));
        process.exit(message.includes("not found") ? 1 : 2);
      }
    });
}
