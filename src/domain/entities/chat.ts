export type ChatType = "private" | "group" | "supergroup" | "channel";

export type Chat = {
  readonly id: number;
  readonly type: ChatType;
  readonly isForum: boolean;
  readonly title: string;
  readonly username: string | null;
  readonly unreadCount: number;
  readonly lastMessage: string | null;
  readonly lastActivity: Date;
};
