import { type Message as MtcuteMessage, SearchFilters, TelegramClient, type tl } from "@mtcute/node";
import { encodeQR } from "qr";
import type { Account } from "../domain/entities/account.js";
import type { Chat, ChatType } from "../domain/entities/chat.js";
import type { Media, MediaType } from "../domain/entities/media.js";
import type { Message } from "../domain/entities/message.js";
import type { MessageFilter } from "../domain/entities/message-filter.js";
import type { MessageLink } from "../domain/entities/message-link.js";
import type { Topic } from "../domain/entities/topic.js";
import type { TelegramGateway } from "../domain/ports/telegram-gateway.js";

const searchFilters: Readonly<Record<MessageFilter, tl.TypeMessagesFilter>> = {
  url: SearchFilters.Url,
  photo: SearchFilters.Photo,
  video: SearchFilters.Video,
  "photo-video": SearchFilters.PhotoAndVideo,
  document: SearchFilters.Document,
  gif: SearchFilters.Gif,
  voice: SearchFilters.Voice,
  audio: SearchFilters.Audio,
  "video-note": SearchFilters.Round,
  pinned: SearchFilters.Pinned,
};

type MessageMedia = NonNullable<Awaited<ReturnType<TelegramClient["getMessages"]>>[0]>["media"];

function messageLinks(message: MtcuteMessage): MessageLink[] {
  return message.entities.flatMap((entity): MessageLink[] => {
    if (!entity.is("text_link") && !entity.is("url")) return [];
    const { offset, length } = entity;
    if (
      !Number.isInteger(offset) ||
      !Number.isInteger(length) ||
      offset < 0 ||
      length <= 0 ||
      offset + length > message.text.length
    ) {
      console.warn(`Skipping invalid link entity: messageId=${message.id} offset=${offset} length=${length}`);
      return [];
    }
    return [
      {
        kind: entity.is("text_link") ? "text_link" : "url",
        offset: entity.offset,
        length: entity.length,
        text: entity.text,
        url: entity.is("text_link") ? entity.params.url : entity.text,
      },
    ];
  });
}

function mapMediaTypeFromMtcute(media: NonNullable<MessageMedia>): MediaType | null {
  switch (media.type) {
    case "photo":
      return "photo";
    case "video":
      if (media.isRound) return "video_note";
      if (media.isAnimation) return "animation";
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

function messageTopicId(message: MtcuteMessage): number | null {
  const chat = message.chat;
  if (chat.type !== "chat" || chat.chatType !== "supergroup" || !chat.isForum) return null;
  const reply = message.replyToMessage;
  if (reply?.isScheduled || message.replyToStory) return null;
  const replyPeer = reply?.raw.replyToPeerId;
  if (replyPeer && (replyPeer._ !== "peerChannel" || replyPeer.channelId !== chat.raw.id)) {
    return reply.raw.replyToTopId ?? 1;
  }
  if (reply?.raw.replyFrom) return null;
  if (message.raw._ === "messageService" && message.raw.action._ === "messageActionTopicCreate") return message.id;
  if (message.isTopicMessage) return reply?.threadId ?? null;
  return message.isService ? null : 1;
}

function messageFromMtcute(message: MtcuteMessage): Message {
  return {
    id: message.id,
    chatId: message.chat.id,
    senderName: message.sender.displayName,
    text: message.text || null,
    links: messageLinks(message),
    date: message.date,
    media: mapMedia(message.media),
    replyToId: message.replyToMessage?.id ?? null,
    topicId: messageTopicId(message),
    isOutgoing: message.isOutgoing,
  };
}

function telegramDate(seconds: number): Date | undefined {
  /* mtcute normalizes dates with signed 32-bit truncation; zero disables a bound. */
  return seconds > 0 && seconds <= 2_147_483_647 ? new Date(seconds * 1000) : undefined;
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

function mapPeerChatType(peer: MtcuteMessage["chat"]): ChatType {
  if (peer.type !== "chat") return "private";
  switch (peer.chatType) {
    case "group":
      return "group";
    case "supergroup":
    case "gigagroup":
    case "monoforum":
      return "supergroup";
    case "channel":
      return "channel";
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
        isForum: peer.type === "chat" && Boolean(peer.isForum),
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

  async getMessages(params: Parameters<TelegramGateway["getMessages"]>[0]): Promise<Message[]> {
    if (params.before && params.before.getTime() <= 0) return [];

    const limit = params.all ? Infinity : params.limit;
    const messages: Message[] = [];
    const seenIds = new Set<number>();
    const before = params.before ? telegramDate(Math.ceil(params.before.getTime() / 1000)) : undefined;
    let offset = before ? { id: 0, date: before.getTime() / 1000 } : undefined;
    let hasReachedLowerBound = false;

    while (messages.length < limit && !hasReachedLowerBound) {
      const batch = await this.messagePage(params, Math.min(limit - messages.length, 100), offset);
      if (batch.messages.length === 0) break;

      for (const message of batch.messages) {
        if (params.after && message.date < params.after) {
          hasReachedLowerBound = true;
          break;
        }
        if ((params.before && message.date >= params.before) || seenIds.has(message.id)) continue;
        seenIds.add(message.id);
        messages.push(messageFromMtcute(message));
        if (messages.length === limit) break;
      }

      params.onProgress?.(messages.length);
      if (messages.length === limit || hasReachedLowerBound || !batch.next) break;
      if (offset && offset.id !== 0 && batch.next.id >= offset.id) {
        throw new Error("Telegram pagination did not advance");
      }
      offset = batch.next;
    }

    return messages.reverse();
  }

  private async messagePage(
    params: Parameters<TelegramGateway["getMessages"]>[0],
    limit: number,
    offset?: { id: number; date: number },
  ): Promise<{ messages: readonly MtcuteMessage[]; next?: { id: number; date: number } }> {
    const chatId = parseChatId(params.chatId);
    if (params.threadId || params.filter || params.query || params.from) {
      const batch = await this.client.searchMessages({
        chatId,
        threadId: params.threadId,
        filter: params.filter ? searchFilters[params.filter] : undefined,
        query: params.query,
        fromUser: params.from === undefined ? undefined : parseChatId(params.from),
        minDate: params.after ? telegramDate(Math.ceil(params.after.getTime() / 1000) - 1) : undefined,
        maxDate: params.before ? telegramDate(Math.ceil(params.before.getTime() / 1000)) : undefined,
        limit,
        offset: offset?.id ?? 0,
      });
      return { messages: batch, next: batch.next === undefined ? undefined : { id: batch.next, date: 0 } };
    }

    const batch = await this.client.getHistory(chatId, { limit, offset });
    return { messages: batch, next: batch.next };
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
