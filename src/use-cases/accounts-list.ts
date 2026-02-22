import type { Account } from "../domain/entities/account.js";
import type { CredentialStorage } from "../domain/ports/credential-storage.js";

export class AccountsListUseCase {
  constructor(private readonly credentialStorage: CredentialStorage) {}

  async execute(): Promise<Account[]> {
    return this.credentialStorage.getAccounts();
  }
}
