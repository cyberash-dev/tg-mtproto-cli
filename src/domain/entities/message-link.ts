export type MessageLink = {
  readonly kind: "url" | "text_link";
  readonly offset: number;
  readonly length: number;
  readonly text: string;
  readonly url: string;
};
