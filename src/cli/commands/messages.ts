import { type Command, InvalidArgumentError, Option } from "commander";
import { type MessageFilter, messageFilters } from "../../domain/entities/message-filter.js";
import type { MessagesListUseCase } from "../../use-cases/messages-list.js";
import { dateArgument } from "../date-argument.js";
import { exitWithError } from "../errors.js";
import { formatMessagesJson, formatMessagesText } from "../formatters/message-formatter.js";

function integerArgument(argument: string, label: string, minimum: number, maximum: number): number {
  const integer = Number(argument);
  if (!/^\d+$/.test(argument) || !Number.isSafeInteger(integer) || integer < minimum || integer > maximum) {
    throw new InvalidArgumentError(`Invalid ${label}: expected an integer from ${minimum} to ${maximum}`);
  }
  return integer;
}

function nonEmptyArgument(argument: string, label: string): string {
  if (argument.trim().length === 0) throw new InvalidArgumentError(`${label} must not be empty`);
  return argument;
}

export function registerMessagesCommand(program: Command, messagesListUseCase: MessagesListUseCase) {
  program
    .command("messages <chat>")
    .description("List messages from a chat")
    .option(
      "-n <count>",
      "Number of latest matches (0 returns none)",
      (argument) => integerArgument(argument, "count", 0, Number.MAX_SAFE_INTEGER),
      100,
    )
    .option("--all", "Load all matches in the selected scope (overrides -n)", false)
    .option("--topic <id>", "Load messages from a specific forum topic", (argument) =>
      integerArgument(argument, "topic ID", 1, 2_147_483_647),
    )
    .addOption(new Option("--filter <kind>", "Search by message category").choices(messageFilters))
    .option("--after <datetime>", "Show messages at or after given time (YYYY-MM-DD, YYYY-MM-DDTHH:mm, HH:mm)")
    .option("--before <datetime>", "Show messages before given time (exclusive)")
    .option("--query <text>", "Search message text on Telegram", (argument) => nonEmptyArgument(argument, "Query"))
    .option("--from <peer>", "Search messages from a sender ID or username", (argument) =>
      nonEmptyArgument(argument, "Sender"),
    )
    .action(
      async (
        chat: string,
        opts: {
          n: number;
          all: boolean;
          topic?: number;
          after?: string;
          filter?: MessageFilter;
          query?: string;
          from?: string;
          before?: string;
        },
      ) => {
        let progressWidth = 0;
        const clearProgress = (): void => {
          if (progressWidth === 0) return;
          process.stderr.write(`\r${" ".repeat(progressWidth)}\r`);
          progressWidth = 0;
        };
        try {
          nonEmptyArgument(chat, "Chat");
          const { json, account } = program.opts<{ json?: boolean; account?: string }>();
          const after = opts.after === undefined ? undefined : dateArgument(opts.after);
          const before = opts.before === undefined ? undefined : dateArgument(opts.before);
          if (after && before && after >= before) throw new RangeError("--after must be earlier than --before");
          if (opts.all && !after && !before) {
            process.stderr.write(
              "Warning: --all without date bounds loads all matching messages into memory. " +
                "Add --after/--before or omit --all to use -n.\n",
            );
          }

          const messages = await messagesListUseCase.execute({
            alias: account,
            chat,
            limit: opts.n,
            all: opts.all,
            threadId: opts.topic,
            filter: opts.filter,
            after,
            before,
            query: opts.query,
            from: opts.from,
            onProgress: json
              ? undefined
              : (loaded: number) => {
                  const progress = `Loading messages... ${loaded} loaded`;
                  progressWidth = progress.length;
                  process.stderr.write(`\r${progress}`);
                },
          });

          clearProgress();

          console.log(json ? formatMessagesJson(messages) : formatMessagesText(messages));
        } catch (err: unknown) {
          clearProgress();
          const message = err instanceof Error ? err.message : String(err);
          exitWithError(program, message, message.includes("No default") || message.includes("expired") ? 2 : 1);
        }
      },
    );
}
