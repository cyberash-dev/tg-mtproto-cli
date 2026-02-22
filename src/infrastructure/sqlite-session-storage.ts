import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SessionStorage } from "../domain/ports/session-storage.js";

export class SqliteSessionStorage implements SessionStorage {
  private readonly sessionsDir: string;

  constructor() {
    this.sessionsDir = join(homedir(), ".tg-mtproto-cli", "sessions");
    mkdirSync(this.sessionsDir, { recursive: true });
  }

  getSessionPath(phone: string): string {
    return join(this.sessionsDir, `${phone}.session`);
  }

  sessionExists(phone: string): boolean {
    return existsSync(this.getSessionPath(phone));
  }

  async removeSession(phone: string): Promise<void> {
    const path = this.getSessionPath(phone);
    if (existsSync(path)) {
      unlinkSync(path);
    }
  }
}
