import type { Account } from "../domain/entities/account.js";
import type { CredentialStorage } from "../domain/ports/credential-storage.js";
import type { SessionStorage } from "../domain/ports/session-storage.js";
import type { CreateTelegramGateway } from "../domain/ports/telegram-gateway.js";

export class LogoutUseCase {
  constructor(
    private readonly credentialStorage: CredentialStorage,
    private readonly sessionStorage: SessionStorage,
    private readonly createGateway: CreateTelegramGateway,
  ) {}

  async execute(alias?: string): Promise<{ account: Account; othersExist: boolean }> {
    let account: Account | null;
    if (alias) {
      account = await this.credentialStorage.getAccountByAlias(alias);
      if (!account) throw new Error(`Account "${alias}" not found`);
    } else {
      account = await this.credentialStorage.getDefaultAccount();
      if (!account) {
        const all = await this.credentialStorage.getAccounts();
        if (all.length === 0) throw new Error("No accounts found. Use 'tg auth' to log in.");
        throw new Error("No default account set. Specify an alias or use 'tg default <alias>'.");
      }
    }

    const apiCreds = await this.credentialStorage.getApiCredentials();
    if (apiCreds) {
      const sessionPath = this.sessionStorage.getSessionPath(account.phone);
      const gateway = this.createGateway({
        apiId: apiCreds.apiId,
        apiHash: apiCreds.apiHash,
        sessionPath,
      });
      try {
        await gateway.connect();
        await gateway.logout();
      } catch {
        // remote logout failure is non-fatal
      } finally {
        await gateway.disconnect();
      }
    }

    await this.sessionStorage.removeSession(account.phone);
    await this.credentialStorage.removeAccount(account.alias);

    const remaining = await this.credentialStorage.getAccounts();
    return { account, othersExist: remaining.length > 0 };
  }
}
