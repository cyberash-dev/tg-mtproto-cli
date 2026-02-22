export type SessionStorage = {
  getSessionPath(phone: string): string;
  sessionExists(phone: string): boolean;
  removeSession(phone: string): Promise<void>;
};
