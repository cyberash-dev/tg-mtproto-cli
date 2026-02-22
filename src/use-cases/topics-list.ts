import type { Topic } from "../domain/entities/topic.js";
import type { CredentialStorage } from "../domain/ports/credential-storage.js";
import type { SessionStorage } from "../domain/ports/session-storage.js";
import type { CreateTelegramGateway } from "../domain/ports/telegram-gateway.js";

export class TopicsListUseCase {
  constructor(
    private readonly credentialStorage: CredentialStorage,
    private readonly sessionStorage: SessionStorage,
    private readonly createGateway: CreateTelegramGateway,
  ) {}

  async execute(params: { alias?: string; chat: string; limit: number }): Promise<Topic[]> {
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
      return await gateway.getTopics({
        chatId: params.chat,
        limit: params.limit,
      });
    } finally {
      await gateway.disconnect();
    }
  }
}
