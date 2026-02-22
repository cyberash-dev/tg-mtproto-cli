import chalk from "chalk";
import type { Media } from "../../domain/entities/media.js";
import type { Message } from "../../domain/entities/message.js";

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min}`;
}

function formatMediaPlaceholder(media: Media): string {
  switch (media.type) {
    case "photo":
      return "[Photo]";
    case "video":
      return media.fileName
        ? `[Video: ${media.fileName}${media.size ? `, ${formatSize(media.size)}` : ""}]`
        : "[Video]";
    case "document":
      return media.fileName
        ? `[Document: ${media.fileName}${media.size ? `, ${formatSize(media.size)}` : ""}]`
        : "[Document]";
    case "audio":
      return media.fileName ? `[Audio: ${media.fileName}]` : "[Audio]";
    case "voice":
      return "[Voice]";
    case "video_note":
      return "[Video message]";
    case "sticker":
      return "[Sticker]";
    case "animation":
      return "[GIF]";
    default:
      return "[Media]";
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatMessagesText(messages: Message[]): string {
  if (messages.length === 0) return "";

  return messages
    .map((msg) => {
      const header = `${chalk.dim(`[${formatDate(msg.date)}]`)} ${chalk.cyan(`#${msg.id}`)} ${chalk.bold(msg.senderName)}:`;
      const lines: string[] = [header];

      if (msg.text) {
        lines.push(`  ${msg.text}`);
      }
      if (msg.media) {
        lines.push(`  ${chalk.italic(formatMediaPlaceholder(msg.media))}`);
      }
      if (!msg.text && !msg.media) {
        lines.push(`  ${chalk.dim("[empty message]")}`);
      }

      return lines.join("\n");
    })
    .join("\n\n");
}

export function formatMessagesJson(messages: Message[]): string {
  return JSON.stringify(messages, null, 2);
}
