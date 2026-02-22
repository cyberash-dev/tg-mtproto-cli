import { Command } from "commander";
import type { AccountsListUseCase } from "../use-cases/accounts-list.js";
import type { AccountsRenameUseCase } from "../use-cases/accounts-rename.js";
import type { AuthUseCase } from "../use-cases/auth.js";
import type { ChatsListUseCase } from "../use-cases/chats-list.js";
import type { DownloadMediaUseCase } from "../use-cases/download-media.js";
import type { LogoutUseCase } from "../use-cases/logout.js";
import type { MessagesListUseCase } from "../use-cases/messages-list.js";
import type { SetDefaultAccountUseCase } from "../use-cases/set-default-account.js";
import type { TopicsListUseCase } from "../use-cases/topics-list.js";
import { registerAccountsCommand } from "./commands/accounts.js";
import { registerAuthCommand } from "./commands/auth.js";
import { registerChatsCommand } from "./commands/chats.js";
import { registerDefaultCommand } from "./commands/default.js";
import { registerDownloadCommand } from "./commands/download.js";
import { registerLogoutCommand } from "./commands/logout.js";
import { registerMessagesCommand } from "./commands/messages.js";
import { registerTopicsCommand } from "./commands/topics.js";

export type UseCases = {
  auth: AuthUseCase;
  logout: LogoutUseCase;
  accountsList: AccountsListUseCase;
  accountsRename: AccountsRenameUseCase;
  setDefault: SetDefaultAccountUseCase;
  chatsList: ChatsListUseCase;
  messagesList: MessagesListUseCase;
  downloadMedia: DownloadMediaUseCase;
  topicsList: TopicsListUseCase;
};

export function createApp(useCases: UseCases): Command {
  const program = new Command();

  program
    .name("tg")
    .description("CLI for Telegram via MTProto")
    .version("0.1.0")
    .option("--account <alias>", "Use a specific account instead of default")
    .option("--json", "Output in JSON format");

  registerAuthCommand(program, useCases.auth);
  registerLogoutCommand(program, useCases.logout);
  registerAccountsCommand(program, useCases.accountsList, useCases.accountsRename);
  registerDefaultCommand(program, useCases.setDefault);
  registerChatsCommand(program, useCases.chatsList);
  registerMessagesCommand(program, useCases.messagesList);
  registerDownloadCommand(program, useCases.downloadMedia);
  registerTopicsCommand(program, useCases.topicsList);

  return program;
}
