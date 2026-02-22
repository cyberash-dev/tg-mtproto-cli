import type { Account } from "../domain/entities/account.js";
import type { CredentialStorage } from "../domain/ports/credential-storage.js";

export class SetDefaultAccountUseCase {
  constructor(private readonly credentialStorage: CredentialStorage) {}

  async execute(alias: string): Promise<Account> {
    const account = await this.credentialStorage.getAccountByAlias(alias);
    if (!account) throw new Error(`Account "${alias}" not found`);
    if (account.isDefault) throw new Error(`Account "${alias}" is already the default`);
    await this.credentialStorage.setDefault(alias);
    return { ...account, isDefault: true };
  }
}
