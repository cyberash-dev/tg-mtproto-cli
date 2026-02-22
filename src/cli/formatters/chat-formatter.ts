import chalk from "chalk";
import Table from "cli-table3";
import type { Chat } from "../../domain/entities/chat.js";

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatChatsTable(chats: Chat[]): string {
  if (chats.length === 0) {
    return chalk.yellow("No chats found.");
  }

  const table = new Table({
    head: ["#", "Chat ID", "Type", "Title", "Unread", "Last Activity"],
    style: { head: ["cyan"] },
  });

  chats.forEach((chat, i) => {
    table.push([
      i + 1,
      chat.id,
      chat.type,
      chat.title,
      chat.unreadCount > 0 ? chalk.bold(String(chat.unreadCount)) : "—",
      formatTimeAgo(chat.lastActivity),
    ]);
  });

  return table.toString();
}

export function formatChatsJson(chats: Chat[]): string {
  return JSON.stringify(chats, null, 2);
}
