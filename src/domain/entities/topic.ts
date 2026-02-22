export type Topic = {
  readonly id: number;
  readonly title: string;
  readonly unreadCount: number;
  readonly isClosed: boolean;
  readonly isPinned: boolean;
};
