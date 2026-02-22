import { createApp } from "./cli/app.js";
import { KeychainCredentialStorage } from "./infrastructure/keychain-credential-storage.js";
import { SqliteSessionStorage } from "./infrastructure/sqlite-session-storage.js";
import { createTelegramGateway } from "./infrastructure/telegram-gateway-factory.js";
import { AccountsListUseCase } from "./use-cases/accounts-list.js";
import { AccountsRenameUseCase } from "./use-cases/accounts-rename.js";
import { AuthUseCase } from "./use-cases/auth.js";
import { ChatsListUseCase } from "./use-cases/chats-list.js";
import { DownloadMediaUseCase } from "./use-cases/download-media.js";
import { LogoutUseCase } from "./use-cases/logout.js";
import { MessagesListUseCase } from "./use-cases/messages-list.js";
import { SetDefaultAccountUseCase } from "./use-cases/set-default-account.js";
import { TopicsListUseCase } from "./use-cases/topics-list.js";

const credentialStorage = new KeychainCredentialStorage();
const sessionStorage = new SqliteSessionStorage();

const useCases = {
  auth: new AuthUseCase(credentialStorage, sessionStorage, createTelegramGateway),
  logout: new LogoutUseCase(credentialStorage, sessionStorage, createTelegramGateway),
  accountsList: new AccountsListUseCase(credentialStorage),
  accountsRename: new AccountsRenameUseCase(credentialStorage),
  setDefault: new SetDefaultAccountUseCase(credentialStorage),
  chatsList: new ChatsListUseCase(credentialStorage, sessionStorage, createTelegramGateway),
  messagesList: new MessagesListUseCase(credentialStorage, sessionStorage, createTelegramGateway),
  downloadMedia: new DownloadMediaUseCase(credentialStorage, sessionStorage, createTelegramGateway),
  topicsList: new TopicsListUseCase(credentialStorage, sessionStorage, createTelegramGateway),
};

const app = createApp(useCases);
app.parseAsync(process.argv);
