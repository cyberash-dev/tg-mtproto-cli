import type { Command } from "commander";
import type { ChatType } from "../../domain/entities/chat.js";
import type { ChatsListUseCase } from "../../use-cases/chats-list.js";
import { exitWithError } from "../errors.js";
import { formatChatsJson, formatChatsTable } from "../formatters/chat-formatter.js";

const VALID_TYPES = ["private", "group", "supergroup", "channel"];

export function registerChatsCommand(program: Command, chatsListUseCase: ChatsListUseCase) {
  program
    .command("chats")
    .description("List chats")
    .option("--type <type>", "Filter by chat type: private, group, supergroup, channel")
    .option("--limit <n>", "Number of chats to show", "50")
    .option("--offset <n>", "Offset for pagination", "0")
    .action(async (opts) => {
      try {
        if (opts.type && !VALID_TYPES.includes(opts.type)) {
          throw new Error(`Invalid chat type. Use: ${VALID_TYPES.join(", ")}`);
        }

        const chats = await chatsListUseCase.execute({
          alias: program.opts().account,
          limit: parseInt(opts.limit, 10),
          offset: parseInt(opts.offset, 10),
          type: opts.type as ChatType | undefined,
        });

        const json = program.opts().json;
        console.log(json ? formatChatsJson(chats) : formatChatsTable(chats));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        exitWithError(program, message, message.includes("No default") || message.includes("expired") ? 2 : 1);
      }
    });
}
