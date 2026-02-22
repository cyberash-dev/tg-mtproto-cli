import chalk from "chalk";
import Table from "cli-table3";
import type { Account } from "../../domain/entities/account.js";

export function formatAccountsTable(accounts: Account[]): string {
  if (accounts.length === 0) {
    return chalk.yellow("No accounts found. Use 'tg auth' to log in.");
  }

  const table = new Table({
    head: ["#", "Alias", "Phone", "Name", "Default"],
    style: { head: ["cyan"] },
  });

  accounts.forEach((acc, i) => {
    const name = acc.lastName ? `${acc.firstName} ${acc.lastName}` : acc.firstName;
    table.push([i + 1, acc.alias, acc.phone, name, acc.isDefault ? chalk.green("*") : ""]);
  });

  return table.toString();
}

export function formatAccountsJson(accounts: Account[]): string {
  return JSON.stringify(accounts, null, 2);
}
