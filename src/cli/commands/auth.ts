import { createInterface } from "node:readline";
import chalk from "chalk";
import type { Command } from "commander";
import type { AuthUseCase } from "../../use-cases/auth.js";
import { exitWithError } from "../errors.js";

function prompt(
  rl: ReturnType<typeof createInterface>,
  question: string,
  isPassword: boolean = false,
): Promise<string> {
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      if (isPassword) {
        resolve(answer);
      } else {
        resolve(answer.trim());
      }
    }),
  );
}

export function registerAuthCommand(program: Command, authUseCase: AuthUseCase) {
  program
    .command("auth")
    .description("Authorize a Telegram account")
    .action(async () => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        const account = await authUseCase.execute({
          promptApiId: async () => {
            const raw = await prompt(rl, "API ID (from https://my.telegram.org): ");
            const id = parseInt(raw, 10);
            if (Number.isNaN(id)) throw new Error("Invalid API ID");
            return id;
          },
          promptApiHash: async () => {
            return prompt(rl, "API Hash: ");
          },
          promptPhone: async () => {
            return prompt(rl, "Phone number: ");
          },
          promptCode: async () => {
            return prompt(rl, "Confirmation code: ");
          },
          promptPassword: async () => {
            return prompt(rl, "2FA password: ", true);
          },
          promptAlias: async (defaultAlias: string) => {
            const input = await prompt(rl, `Alias (default: ${defaultAlias}): `);
            return input.trim() || defaultAlias;
          },
          onAliasTaken: (alias: string) => {
            console.error(chalk.red(`Alias "${alias}" is already taken. Choose another.`));
          },
          onAlreadyLoggedIn: async (existing) => {
            const answer = await prompt(
              rl,
              chalk.yellow(
                `Account "${existing.alias}" (${existing.phone}) is already logged in. Re-authenticate? (y/n): `,
              ),
            );
            return answer.toLowerCase() === "y";
          },
        });

        const name = account.lastName ? `${account.firstName} ${account.lastName}` : account.firstName;
        const username = account.username ? ` (@${account.username})` : "";
        console.log(chalk.green(`Logged in as ${name}${username}, alias: ${account.alias}`));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        exitWithError(program, message, 1);
      } finally {
        rl.close();
      }
    });
}
