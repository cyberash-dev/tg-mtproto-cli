import { TelegramClient } from "@mtcute/node";
import { encodeQR } from "qr";
import type { Account } from "../domain/entities/account.js";
import type { Chat, ChatType } from "../domain/entities/chat.js";
import type { Media, MediaType } from "../domain/entities/media.js";
import type { Message } from "../domain/entities/message.js";
import type { Topic } from "../domain/entities/topic.js";
import type { TelegramGateway } from "../domain/ports/telegram-gateway.js";

type MessageMedia = NonNullable<Awaited<ReturnType<TelegramClient["getMessages"]>>[0]>["media"];

function mapMediaTypeFromMtcute(media: NonNullable<MessageMedia>): MediaType | null {
  switch (media.type) {
    case "photo":
      return "photo";
    case "video":
      return "video";
    case "document":
      return "document";
    case "audio":
      return "audio";
    case "voice":
      return "voice";
    case "sticker":
      return "sticker";
    default:
      return null;
  }
}

function mapMedia(raw: MessageMedia): Media | null {
  if (!raw) return null;
  const mediaType = mapMediaTypeFromMtcute(raw);
  if (!mediaType) return null;

  let fileName: string | null = null;
  let mimeType: string | null = null;
  let size: number | null = null;

  if ("fileName" in raw && typeof raw.fileName === "string") {
    fileName = raw.fileName;
  }
  if ("mimeType" in raw && typeof raw.mimeType === "string") {
    mimeType = raw.mimeType;
  }
  if ("fileSize" in raw && typeof raw.fileSize === "number") {
    size = raw.fileSize;
  }

  if (!mimeType) {
    const defaults: Partial<Record<MediaType, string>> = {
      photo: "image/jpeg",
      sticker: "image/webp",
      voice: "audio/ogg",
    };
    mimeType = defaults[mediaType] ?? null;
  }

  return { type: mediaType, fileName, mimeType, size };
}

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "application/pdf": ".pdf",
};

function extFromMime(mime: string | null | undefined): string {
  if (!mime) return "";
  return MIME_EXT[mime] ?? "";
}

function parseChatId(chatId: string | number): string | number {
  if (typeof chatId === "number") return chatId;
  const num = Number(chatId);
  return Number.isFinite(num) ? num : chatId;
}

function mapPeerChatType(peer: { readonly type: string }): ChatType {
  switch (peer.type) {
    case "user":
    case "bot":
      return "private";
    case "group":
      return "group";
    case "supergroup":
      return "supergroup";
    case "channel":
      return "channel";
    default:
      return "private";
  }
}

export class MtcuteTelegramGateway implements TelegramGateway {
  private client: TelegramClient;

  constructor(params: { apiId: number; apiHash: string; sessionPath: string }) {
    this.client = new TelegramClient({
      apiId: params.apiId,
      apiHash: params.apiHash,
      storage: params.sessionPath,
    });
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    await this.client.destroy();
  }

  async auth(params: {
    phone: () => Promise<string>;
    code: () => Promise<string>;
    password: () => Promise<string>;
  }): Promise<Account> {
    const user = await this.client.start({
      phone: params.phone,
      password: params.password,
      qrCodeHandler: (url) => {
        console.log(encodeQR(url, "ascii"));
      },
    });

    return {
      id: user.id,
      phone: user.phoneNumber ?? "",
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? null,
      username: user.username ?? null,
      alias: "",
      isDefault: false,
    };
  }

  async logout(): Promise<void> {
    await this.client.logOut();
  }

  async getChats(params: { limit: number; offset: number; type?: ChatType }): Promise<Chat[]> {
    const chats: Chat[] = [];
    let count = 0;

    for await (const dialog of this.client.iterDialogs({ limit: params.limit + params.offset })) {
      if (count < params.offset) {
        count++;
        continue;
      }

      const peer = dialog.peer;
      const chatType = mapPeerChatType(peer);

      if (params.type && chatType !== params.type) continue;

      const lastMsg = dialog.lastMessage;
      let lastMessageText: string | null = null;
      if (lastMsg) {
        const text = lastMsg.text;
        if (text) {
          lastMessageText = text.length > 100 ? `${text.slice(0, 100)}...` : text;
        } else if (lastMsg.media) {
          lastMessageText = `[${lastMsg.media.type}]`;
        }
      }

      chats.push({
        id: peer.id,
        type: chatType,
        title: peer.displayName,
        username: "username" in peer ? (peer.username ?? null) : null,
        unreadCount: dialog.unreadCount,
        lastMessage: lastMessageText,
        lastActivity: lastMsg?.date ?? new Date(),
      });

      if (chats.length >= params.limit) break;
    }

    return chats;
  }

  async getMessages(params: {
    chatId: string | number;
    limit: number;
    all: boolean;
    threadId?: number;
    after?: Date;
    onProgress?: (loaded: number) => void;
  }): Promise<Message[]> {
    const resolvedChatId = parseChatId(params.chatId);
    const scanLimit = params.after ? Infinity : params.all ? Infinity : params.limit;
    let messages: Message[];

    if (params.threadId) {
      messages = await this.getMessagesByThread(
        resolvedChatId,
        params.threadId,
        scanLimit,
        params.after,
        params.onProgress,
      );
    } else {
      messages = await this.getMessagesByHistory(resolvedChatId, scanLimit, params.after, params.onProgress);
    }

    if (!params.all && params.limit < messages.length) {
      return messages.slice(-params.limit);
    }
    return messages;
  }

  private async getMessagesByHistory(
    chatId: string | number,
    limit: number,
    after?: Date,
    onProgress?: (loaded: number) => void,
  ): Promise<Message[]> {
    if (after) {
      return this.getHistoryForward(chatId, after, onProgress);
    }
    return this.getHistoryBackward(chatId, limit, onProgress);
  }

  private async getHistoryForward(
    chatId: string | number,
    after: Date,
    onProgress?: (loaded: number) => void,
  ): Promise<Message[]> {
    const messages: Message[] = [];
    let offset: { id: number; date: number } = { id: 0, date: Math.floor(after.getTime() / 1000) };
    let loaded = 0;

    while (true) {
      const batch = await this.client.getHistory(chatId, {
        limit: 100,
        offset,
        reverse: true,
      });

      if (batch.length === 0) break;

      for (const msg of batch) {
        messages.push({
          id: msg.id,
          chatId: msg.chat.id,
          senderName: msg.sender.displayName,
          text: msg.text || null,
          date: msg.date,
          media: mapMedia(msg.media),
          replyToId: msg.replyToMessage?.id ?? null,
          isOutgoing: msg.isOutgoing,
        });
      }

      loaded += batch.length;
      onProgress?.(loaded);

      const lastMsg = batch[batch.length - 1];
      offset = { id: lastMsg.id, date: Math.floor(lastMsg.date.getTime() / 1000) };

      if (batch.length < 100) break;
    }

    return messages;
  }

  private async getHistoryBackward(
    chatId: string | number,
    limit: number,
    onProgress?: (loaded: number) => void,
  ): Promise<Message[]> {
    const messages: Message[] = [];
    let offset: { id: number; date: number } | undefined;
    let loaded = 0;

    while (loaded < limit) {
      const batchSize = Math.min(limit === Infinity ? 100 : limit - loaded, 100);
      const batch = await this.client.getHistory(chatId, {
        limit: batchSize,
        offset,
      });

      if (batch.length === 0) break;

      for (const msg of batch) {
        messages.push({
          id: msg.id,
          chatId: msg.chat.id,
          senderName: msg.sender.displayName,
          text: msg.text || null,
          date: msg.date,
          media: mapMedia(msg.media),
          replyToId: msg.replyToMessage?.id ?? null,
          isOutgoing: msg.isOutgoing,
        });
      }

      loaded += batch.length;
      onProgress?.(loaded);

      const lastMsg = batch[batch.length - 1];
      if (lastMsg) {
        offset = { id: lastMsg.id, date: Math.floor(lastMsg.date.getTime() / 1000) };
      }

      if (batch.length < batchSize) break;
    }

    messages.reverse();
    return messages;
  }

  private async getMessagesByThread(
    chatId: string | number,
    threadId: number,
    limit: number,
    after?: Date,
    onProgress?: (loaded: number) => void,
  ): Promise<Message[]> {
    const messages: Message[] = [];
    let searchOffset = 0;
    let loaded = 0;
    let hitDateBoundary = false;

    while (loaded < limit && !hitDateBoundary) {
      const batchSize = Math.min(limit === Infinity ? 100 : limit - loaded, 100);
      const batch = await this.client.searchMessages({
        chatId,
        threadId,
        limit: batchSize,
        offset: searchOffset,
      });

      if (batch.length === 0) break;

      for (const msg of batch) {
        if (after && msg.date < after) {
          hitDateBoundary = true;
          break;
        }

        messages.push({
          id: msg.id,
          chatId: msg.chat.id,
          senderName: msg.sender.displayName,
          text: msg.text || null,
          date: msg.date,
          media: mapMedia(msg.media),
          replyToId: msg.replyToMessage?.id ?? null,
          isOutgoing: msg.isOutgoing,
        });
      }

      loaded += batch.length;
      onProgress?.(loaded);
      searchOffset = batch[batch.length - 1].id;

      if (batch.length < batchSize) break;
    }

    messages.reverse();
    return messages;
  }

  async downloadMedia(params: {
    chatId: string | number;
    messageId: number;
    outputPath: string;
    onProgress?: (downloaded: number, total: number) => void;
  }): Promise<{ path: string; fileName: string; size: number; mimeType: string }> {
    const [msg] = await this.client.getMessages(parseChatId(params.chatId), params.messageId);
    if (!msg) throw new Error(`Message #${params.messageId} not found`);
    if (!msg.media) {
      throw new Error(`Message #${params.messageId} has no media attachment`);
    }

    const media = mapMedia(msg.media);
    const fileName = media?.fileName ?? `${media?.type ?? "file"}_${params.messageId}${extFromMime(media?.mimeType)}`;
    const fullPath = params.outputPath.endsWith("/")
      ? `${params.outputPath}${fileName}`
      : `${params.outputPath}/${fileName}`;

    let totalSize = media?.size ?? 0;
    let downloaded = 0;

    const downloadable = msg.media as import("@mtcute/core").FileDownloadLocation;
    await this.client.downloadToFile(fullPath, downloadable, {
      progressCallback: (current, total) => {
        downloaded = Number(current);
        totalSize = Number(total);
        params.onProgress?.(downloaded, totalSize);
      },
    });

    return {
      path: fullPath,
      fileName,
      size: totalSize,
      mimeType: media?.mimeType ?? "application/octet-stream",
    };
  }

  async getTopics(params: { chatId: string | number; limit: number }): Promise<Topic[]> {
    const resolvedChatId = parseChatId(params.chatId);
    const topics: Topic[] = [];

    for await (const topic of this.client.iterForumTopics(resolvedChatId, { limit: params.limit })) {
      topics.push({
        id: topic.id,
        title: topic.title,
        unreadCount: topic.unreadCount,
        isClosed: topic.isClosed,
        isPinned: topic.isPinned,
      });

      if (topics.length >= params.limit) break;
    }

    return topics;
  }

  async resolveChat(identifier: string | number): Promise<{ id: number; type: ChatType }> {
    const peer = await this.client.resolvePeer(parseChatId(identifier));
    let type: ChatType = "private";
    let id = 0;

    switch (peer._) {
      case "inputPeerUser":
        type = "private";
        id = Number(peer.userId);
        break;
      case "inputPeerChat":
        type = "group";
        id = Number(peer.chatId);
        break;
      case "inputPeerChannel":
        type = "supergroup";
        id = Number(peer.channelId);
        break;
    }

    return { id, type };
  }
}
