import type { CredentialStorage } from "../domain/ports/credential-storage.js";
import type { SessionStorage } from "../domain/ports/session-storage.js";
import type { CreateTelegramGateway } from "../domain/ports/telegram-gateway.js";

export type DownloadResult = {
  path: string;
  fileName: string;
  size: number;
  mimeType: string;
};

export class DownloadMediaUseCase {
  constructor(
    private readonly credentialStorage: CredentialStorage,
    private readonly sessionStorage: SessionStorage,
    private readonly createGateway: CreateTelegramGateway,
  ) {}

  async execute(params: {
    alias?: string;
    chat: string;
    messageId: number;
    outputDir: string;
    onProgress?: (downloaded: number, total: number) => void;
  }): Promise<DownloadResult> {
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
      return await gateway.downloadMedia({
        chatId: params.chat,
        messageId: params.messageId,
        outputPath: params.outputDir,
        onProgress: params.onProgress,
      });
    } finally {
      await gateway.disconnect();
    }
  }
}
