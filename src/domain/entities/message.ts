import type { Media } from "./media.js";

export type Message = {
  readonly id: number;
  readonly chatId: number;
  readonly senderName: string;
  readonly text: string | null;
  readonly date: Date;
  readonly media: Media | null;
  readonly replyToId: number | null;
  readonly isOutgoing: boolean;
};
