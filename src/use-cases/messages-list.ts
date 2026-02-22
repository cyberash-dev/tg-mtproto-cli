import type { Message } from "../domain/entities/message.js";
import type { CredentialStorage } from "../domain/ports/credential-storage.js";
import type { SessionStorage } from "../domain/ports/session-storage.js";
import type { CreateTelegramGateway } from "../domain/ports/telegram-gateway.js";

export class MessagesListUseCase {
  constructor(
    private readonly credentialStorage: CredentialStorage,
    private readonly sessionStorage: SessionStorage,
    private readonly createGateway: CreateTelegramGateway,
  ) {}

  async execute(params: {
    alias?: string;
    chat: string;
    limit: number;
    all: boolean;
    threadId?: number;
    after?: Date;
    onProgress?: (loaded: number) => void;
  }): Promise<Message[]> {
    const account = params.alias
      ? await this.credentialStorage.getAccountByAlias(params.alias)
      : await this.credentialStorage.getDefaultAccount();

    if (!account) {
      throw new Error("No default account. Use 'tg default <alias>' or --account flag.");
    }

    const apiCreds = await this.credentialStorage.getApiCredentials();
    if (!apiCreds) throw new Error("No API credentials. Run 'tg auth' first.");

    const sessionPath = this.sessionStorage.getSessionPath(account.phone);
    const gateway = this.createGateway({
      apiId: apiCreds.apiId,
      apiHash: apiCreds.apiHash,
      sessionPath,
    });

    try {
      await gateway.connect();
      return await gateway.getMessages({
        chatId: params.chat,
        limit: params.limit,
        all: params.all,
        threadId: params.threadId,
        after: params.after,
        onProgress: params.onProgress,
      });
    } finally {
      await gateway.disconnect();
    }
  }
}
