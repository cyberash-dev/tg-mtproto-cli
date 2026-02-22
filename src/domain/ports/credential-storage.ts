import type { Account } from "../entities/account.js";

export type CredentialStorage = {
  getAccounts(): Promise<Account[]>;
  getAccountByAlias(alias: string): Promise<Account | null>;
  getDefaultAccount(): Promise<Account | null>;
  saveAccount(account: Account): Promise<void>;
  removeAccount(alias: string): Promise<void>;
  setDefault(alias: string): Promise<void>;
  isAliasAvailable(alias: string): Promise<boolean>;
  renameAlias(oldAlias: string, newAlias: string): Promise<void>;
  getApiCredentials(): Promise<{ apiId: number; apiHash: string } | null>;
  saveApiCredentials(apiId: number, apiHash: string): Promise<void>;
};
