import type { Account } from "../domain/entities/account.js";
import type { CredentialStorage } from "../domain/ports/credential-storage.js";
import type { SessionStorage } from "../domain/ports/session-storage.js";
import type { CreateTelegramGateway } from "../domain/ports/telegram-gateway.js";

export type AuthCallbacks = {
  promptApiId: () => Promise<number>;
  promptApiHash: () => Promise<string>;
  promptPhone: () => Promise<string>;
  promptCode: () => Promise<string>;
  promptPassword: () => Promise<string>;
  promptAlias: (defaultAlias: string) => Promise<string>;
  onAliasTaken: (alias: string) => void;
  onAlreadyLoggedIn: (account: Account) => Promise<boolean>;
};

export class AuthUseCase {
  constructor(
    private readonly credentialStorage: CredentialStorage,
    private readonly sessionStorage: SessionStorage,
    private readonly createGateway: CreateTelegramGateway,
  ) {}

  async execute(callbacks: AuthCallbacks): Promise<Account> {
    let apiCreds = await this.credentialStorage.getApiCredentials();
    if (!apiCreds) {
      const apiId = await callbacks.promptApiId();
      const apiHash = await callbacks.promptApiHash();
      await this.credentialStorage.saveApiCredentials(apiId, apiHash);
      apiCreds = { apiId, apiHash };
    }

    const rawPhone = await callbacks.promptPhone();
    const phone = rawPhone.replace(/[\s()-]/g, "");

    const accounts = await this.credentialStorage.getAccounts();
    const normalizedDigits = phone.replace(/\D/g, "");
    const existing = accounts.find((a) => a.phone.replace(/\D/g, "") === normalizedDigits);
    if (existing) {
      const shouldReauth = await callbacks.onAlreadyLoggedIn(existing);
      if (!shouldReauth) throw new Error("Authentication cancelled");
      await this.sessionStorage.removeSession(existing.phone);
      await this.credentialStorage.removeAccount(existing.alias);
    }

    const sessionPath = this.sessionStorage.getSessionPath(phone);
    const gateway = this.createGateway({
      apiId: apiCreds.apiId,
      apiHash: apiCreds.apiHash,
      sessionPath,
    });

    try {
      await gateway.connect();
      const rawAccount = await gateway.auth({
        phone: async () => phone,
        code: callbacks.promptCode,
        password: callbacks.promptPassword,
      });

      const defaultAlias = rawAccount.username ?? phone;
      let alias = await callbacks.promptAlias(defaultAlias);
      if (!alias) alias = defaultAlias;

      while (!(await this.credentialStorage.isAliasAvailable(alias))) {
        callbacks.onAliasTaken(alias);
        alias = await callbacks.promptAlias(defaultAlias);
        if (!alias) alias = defaultAlias;
      }

      const isFirst = accounts.length === 0 || (existing && accounts.length === 1);
      const account: Account = {
        ...rawAccount,
        phone,
        alias,
        isDefault: !!isFirst,
      };

      await this.credentialStorage.saveAccount(account);
      if (isFirst) {
        await this.credentialStorage.setDefault(alias);
      }

      return account;
    } finally {
      await gateway.disconnect();
    }
  }
}
