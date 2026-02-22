import chalk from "chalk";
import Table from "cli-table3";
import type { Topic } from "../../domain/entities/topic.js";

export function formatTopicsTable(topics: Topic[]): string {
  if (topics.length === 0) {
    return chalk.yellow("No topics found. This chat may not be a forum.");
  }

  const table = new Table({
    head: ["#", "Topic ID", "Title", "Unread", "Status"],
    style: { head: ["cyan"] },
  });

  topics.forEach((topic, i) => {
    const status = topic.isClosed ? chalk.dim("closed") : chalk.green("open");
    const pin = topic.isPinned ? ` ${chalk.yellow("pinned")}` : "";
    table.push([
      i + 1,
      topic.id,
      topic.title,
      topic.unreadCount > 0 ? chalk.bold(String(topic.unreadCount)) : "—",
      status + pin,
    ]);
  });

  return table.toString();
}

export function formatTopicsJson(topics: Topic[]): string {
  return JSON.stringify(topics, null, 2);
}
