import { deletePassword, getPassword, setPassword } from "cross-keychain";
import type { Account } from "../domain/entities/account.js";
import type { CredentialStorage } from "../domain/ports/credential-storage.js";

const SERVICE = "tg-mtproto-cli";
const KEY_API_CREDENTIALS = "api_credentials";
const KEY_ACCOUNTS_INDEX = "accounts_index";
const KEY_DEFAULT_ACCOUNT = "default_account";
const accountKey = (alias: string) => `account.${alias}`;

async function readJson<T>(account: string): Promise<T | null> {
  const raw = await getPassword(SERVICE, account);
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

async function writeJson(account: string, data: unknown): Promise<void> {
  await setPassword(SERVICE, account, JSON.stringify(data));
}

export class KeychainCredentialStorage implements CredentialStorage {
  async getAccounts(): Promise<Account[]> {
    const aliases = await readJson<string[]>(KEY_ACCOUNTS_INDEX);
    if (!aliases || aliases.length === 0) return [];
    const accounts: Account[] = [];
    for (const alias of aliases) {
      const acc = await readJson<Account>(accountKey(alias));
      if (acc) accounts.push(acc);
    }
    return accounts;
  }

  async getAccountByAlias(alias: string): Promise<Account | null> {
    return readJson<Account>(accountKey(alias));
  }

  async getDefaultAccount(): Promise<Account | null> {
    const defaultAlias = await getPassword(SERVICE, KEY_DEFAULT_ACCOUNT);
    if (!defaultAlias) return null;
    const alias = JSON.parse(defaultAlias) as string;
    return this.getAccountByAlias(alias);
  }

  async saveAccount(account: Account): Promise<void> {
    await writeJson(accountKey(account.alias), account);
    const aliases = (await readJson<string[]>(KEY_ACCOUNTS_INDEX)) ?? [];
    if (!aliases.includes(account.alias)) {
      aliases.push(account.alias);
      await writeJson(KEY_ACCOUNTS_INDEX, aliases);
    }
  }

  async removeAccount(alias: string): Promise<void> {
    await deletePassword(SERVICE, accountKey(alias));
    const aliases = (await readJson<string[]>(KEY_ACCOUNTS_INDEX)) ?? [];
    const filtered = aliases.filter((a) => a !== alias);
    await writeJson(KEY_ACCOUNTS_INDEX, filtered);
    const defaultAlias = await getPassword(SERVICE, KEY_DEFAULT_ACCOUNT);
    if (defaultAlias && JSON.parse(defaultAlias) === alias) {
      await deletePassword(SERVICE, KEY_DEFAULT_ACCOUNT);
    }
  }

  async setDefault(alias: string): Promise<void> {
    const accounts = await this.getAccounts();
    for (const acc of accounts) {
      const updated = { ...acc, isDefault: acc.alias === alias };
      await writeJson(accountKey(acc.alias), updated);
    }
    await writeJson(KEY_DEFAULT_ACCOUNT, alias);
  }

  async isAliasAvailable(alias: string): Promise<boolean> {
    const existing = await readJson<Account>(accountKey(alias));
    return existing === null;
  }

  async renameAlias(oldAlias: string, newAlias: string): Promise<void> {
    const account = await readJson<Account>(accountKey(oldAlias));
    if (!account) throw new Error(`Account "${oldAlias}" not found`);
    const updated = { ...account, alias: newAlias };
    await writeJson(accountKey(newAlias), updated);
    await deletePassword(SERVICE, accountKey(oldAlias));
    const aliases = (await readJson<string[]>(KEY_ACCOUNTS_INDEX)) ?? [];
    const idx = aliases.indexOf(oldAlias);
    if (idx !== -1) aliases[idx] = newAlias;
    await writeJson(KEY_ACCOUNTS_INDEX, aliases);
    const defaultAlias = await getPassword(SERVICE, KEY_DEFAULT_ACCOUNT);
    if (defaultAlias && JSON.parse(defaultAlias) === oldAlias) {
      await writeJson(KEY_DEFAULT_ACCOUNT, newAlias);
    }
  }

  async getApiCredentials(): Promise<{ apiId: number; apiHash: string } | null> {
    return readJson<{ apiId: number; apiHash: string }>(KEY_API_CREDENTIALS);
  }

  async saveApiCredentials(apiId: number, apiHash: string): Promise<void> {
    await writeJson(KEY_API_CREDENTIALS, { apiId, apiHash });
  }
}
