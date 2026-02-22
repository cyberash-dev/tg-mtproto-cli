import chalk from "chalk";
import type { Command } from "commander";
import type { MessagesListUseCase } from "../../use-cases/messages-list.js";
import { formatMessagesJson, formatMessagesText } from "../formatters/message-formatter.js";

function parseAfterDate(value: string): Date {
  const timeOnly = /^\d{1,2}:\d{2}$/.test(value);
  if (timeOnly) {
    const today = new Date();
    const [h, m] = value.split(":").map(Number);
    today.setHours(h, m, 0, 0);
    return today;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date format. Use: YYYY-MM-DD, YYYY-MM-DDTHH:mm, or HH:mm");
  }
  return parsed;
}

export function registerMessagesCommand(program: Command, messagesListUseCase: MessagesListUseCase) {
  program
    .command("messages <chat>")
    .description("List messages from a chat")
    .option("-n <count>", "Number of messages to load", "100")
    .option("--all", "Load all messages", false)
    .option("--topic <id>", "Load messages from a specific forum topic")
    .option("--after <datetime>", "Show messages after given time (YYYY-MM-DD, YYYY-MM-DDTHH:mm, HH:mm)")
    .action(async (chat: string, opts) => {
      try {
        const json = program.opts().json;
        const after = opts.after ? parseAfterDate(opts.after) : undefined;

        const messages = await messagesListUseCase.execute({
          alias: program.opts().account,
          chat,
          limit: parseInt(opts.n, 10),
          all: opts.all,
          threadId: opts.topic ? parseInt(opts.topic, 10) : undefined,
          after,
          onProgress: json
            ? undefined
            : (loaded: number) => {
                process.stderr.write(`\rLoading messages... ${loaded} loaded`);
              },
        });

        if (!json && (opts.all || after)) {
          process.stderr.write(`\r${" ".repeat(50)}\r`);
        }

        console.log(json ? formatMessagesJson(messages) : formatMessagesText(messages));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(chalk.red(message));
        process.exit(message.includes("No default") || message.includes("expired") ? 2 : 1);
      }
    });
}
