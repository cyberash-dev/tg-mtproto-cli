export type MediaType = "photo" | "video" | "document" | "audio" | "voice" | "video_note" | "sticker" | "animation";

export type Media = {
  readonly type: MediaType;
  readonly fileName: string | null;
  readonly mimeType: string | null;
  readonly size: number | null;
};
