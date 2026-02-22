import type { Account } from "../entities/account.js";
import type { Chat, ChatType } from "../entities/chat.js";
import type { Message } from "../entities/message.js";
import type { Topic } from "../entities/topic.js";

export type TelegramGateway = {
  auth(params: {
    phone: () => Promise<string>;
    code: () => Promise<string>;
    password: () => Promise<string>;
  }): Promise<Account>;

  logout(): Promise<void>;

  getChats(params: { limit: number; offset: number; type?: ChatType }): Promise<Chat[]>;

  getMessages(params: {
    chatId: string | number;
    limit: number;
    all: boolean;
    threadId?: number;
    after?: Date;
    onProgress?: (loaded: number) => void;
  }): Promise<Message[]>;

  downloadMedia(params: {
    chatId: string | number;
    messageId: number;
    outputPath: string;
    onProgress?: (downloaded: number, total: number) => void;
  }): Promise<{ path: string; fileName: string; size: number; mimeType: string }>;

  resolveChat(identifier: string | number): Promise<{ id: number; type: ChatType }>;

  getTopics(params: { chatId: string | number; limit: number }): Promise<Topic[]>;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
};

export type CreateTelegramGateway = (params: {
  apiId: number;
  apiHash: string;
  sessionPath: string;
}) => TelegramGateway;
