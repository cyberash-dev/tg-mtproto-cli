import type { CredentialStorage } from "../domain/ports/credential-storage.js";

const ALIAS_REGEX = /^[a-zA-Z0-9_-]+$/;

export class AccountsRenameUseCase {
  constructor(private readonly credentialStorage: CredentialStorage) {}

  async execute(oldAlias: string, newAlias: string): Promise<void> {
    if (oldAlias === newAlias) throw new Error(`Alias is already "${oldAlias}"`);
    if (!ALIAS_REGEX.test(newAlias)) {
      throw new Error("Invalid alias format. Use: letters, digits, hyphens, underscores");
    }

    const account = await this.credentialStorage.getAccountByAlias(oldAlias);
    if (!account) throw new Error(`Account "${oldAlias}" not found`);

    const available = await this.credentialStorage.isAliasAvailable(newAlias);
    if (!available) throw new Error(`Alias "${newAlias}" is already taken`);

    await this.credentialStorage.renameAlias(oldAlias, newAlias);
  }
}
