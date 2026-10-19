import assert from "node:assert/strict";
import { test } from "node:test";
import { PeersIndex, TelegramClient, Message as TelegramMessage } from "@mtcute/node";
import { Command } from "commander";
import type { CredentialStorage } from "../../domain/ports/credential-storage.js";
import type { SessionStorage } from "../../domain/ports/session-storage.js";
import { createTelegramGateway } from "../../infrastructure/telegram-gateway-factory.js";
import { MessagesListUseCase } from "../../use-cases/messages-list.js";
import { registerMessagesCommand } from "./messages.js";

function unexpectedStorageAccess(): never {
  throw new Error("Unexpected storage access");
}

test("messages --json prints preserved links without progress through the real use case", async (context) => {
  const credentialStorage: CredentialStorage = {
    getDefaultAccount: async () => ({
      id: 123,
      phone: "synthetic",
      firstName: "Alice",
      lastName: null,
      username: null,
      alias: "test",
      isDefault: true,
    }),
    getApiCredentials: async () => ({ apiId: 1, apiHash: "synthetic" }),
    getAccounts: unexpectedStorageAccess,
    getAccountByAlias: unexpectedStorageAccess,
    saveAccount: unexpectedStorageAccess,
    removeAccount: unexpectedStorageAccess,
    setDefault: unexpectedStorageAccess,
    isAliasAvailable: unexpectedStorageAccess,
    renameAlias: unexpectedStorageAccess,
    saveApiCredentials: unexpectedStorageAccess,
  };
  const sessionStorage: SessionStorage = {
    getSessionPath: () => ":memory:",
    sessionExists: unexpectedStorageAccess,
    removeSession: unexpectedStorageAccess,
  };
  const message = new TelegramMessage(
    {
      _: "message",
      id: 42,
      peerId: { _: "peerUser", userId: 123 },
      date: 1_770_000_000,
      out: false,
      message: "Read docs",
      entities: [{ _: "messageEntityTextUrl", offset: 5, length: 4, url: "https://example.com/docs" }],
    },
    PeersIndex.from({ users: [{ _: "user", id: 123, firstName: "Alice" }] }),
  );
  context.mock.method(TelegramClient.prototype, "connect", async () => {});
  context.mock.method(TelegramClient.prototype, "destroy", async () => {});
  context.mock.method(TelegramClient.prototype, "getHistory", async () => [message]);
  const stdout: string[] = [];
  const stderr: string[] = [];
  const stdoutWrite = context.mock.method(process.stdout, "write", (chunk: string | Uint8Array) => {
    stdout.push(String(chunk));
    return true;
  });
  context.mock.method(process.stderr, "write", (chunk: string | Uint8Array) => {
    stderr.push(String(chunk));
    return true;
  });
  const program = new Command().option("--json");
  registerMessagesCommand(program, new MessagesListUseCase(credentialStorage, sessionStorage, createTelegramGateway));

  await program.parseAsync(["--json", "messages", "123", "--all"], { from: "user" });
  stdoutWrite.mock.restore();
  const json: unknown = JSON.parse(stdout.join(""));

  assert.deepEqual(
    { json, stderr },
    {
      json: [
        {
          id: 42,
          chatId: 123,
          senderName: "Alice",
          text: "Read docs",
          links: [{ kind: "text_link", offset: 5, length: 4, text: "docs", url: "https://example.com/docs" }],
          date: new Date(1_770_000_000_000).toISOString(),
          media: null,
          replyToId: null,
          topicId: null,
          isOutgoing: false,
        },
      ],
      stderr: [],
    },
  );
});
