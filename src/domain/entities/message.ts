import type { Media } from "./media.js";
import type { MessageLink } from "./message-link.js";

export type Message = {
  readonly id: number;
  readonly chatId: number;
  readonly senderName: string;
  readonly text: string | null;
  readonly links: readonly MessageLink[];
  readonly date: Date;
  readonly media: Media | null;
  readonly replyToId: number | null;
  readonly topicId: number | null;
  readonly isOutgoing: boolean;
};
