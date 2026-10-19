export const messageFilters = [
  "url",
  "photo",
  "video",
  "photo-video",
  "document",
  "gif",
  "voice",
  "audio",
  "video-note",
  "pinned",
] as const;

export type MessageFilter = (typeof messageFilters)[number];
