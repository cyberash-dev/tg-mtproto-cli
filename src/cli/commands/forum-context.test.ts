import assert from "node:assert/strict";
import { type TestContext, test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { Long, PeersIndex, TelegramClient, Message as TelegramMessage } from "@mtcute/node";
import { Command } from "commander";
import type { CredentialStorage } from "../../domain/ports/credential-storage.js";
import type { SessionStorage } from "../../domain/ports/session-storage.js";
import { createTelegramGateway } from "../../infrastructure/telegram-gateway-factory.js";
import { MessagesListUseCase } from "../../use-cases/messages-list.js";
import { registerMessagesCommand } from "./messages.js";

function unexpectedAccess(): never {
  throw new Error("Unexpected external access");
}

function messageCommand(context: TestContext) {
  const credentialStorage: CredentialStorage = {
    getDefaultAccount: async () => ({
      id: 456,
      phone: "synthetic",
      firstName: "Alice",
      lastName: null,
      username: null,
      alias: "test",
      isDefault: true,
    }),
    getApiCredentials: async () => ({ apiId: 1, apiHash: "synthetic" }),
    getAccounts: unexpectedAccess,
    getAccountByAlias: unexpectedAccess,
    saveAccount: unexpectedAccess,
    removeAccount: unexpectedAccess,
    setDefault: unexpectedAccess,
    isAliasAvailable: unexpectedAccess,
    renameAlias: unexpectedAccess,
    saveApiCredentials: unexpectedAccess,
  };
  const sessionStorage: SessionStorage = {
    getSessionPath: () => ":memory:",
    sessionExists: unexpectedAccess,
    removeSession: unexpectedAccess,
  };
  context.mock.method(TelegramClient.prototype, "connect", async () => {});
  context.mock.method(TelegramClient.prototype, "destroy", async () => {});
  context.mock.method(TelegramClient.prototype, "getHistory", unexpectedAccess);
  context.mock.method(TelegramClient.prototype, "searchMessages", unexpectedAccess);
  context.mock.method(TelegramClient.prototype, "getMessages", unexpectedAccess);
  context.mock.method(TelegramClient.prototype, "getChat", unexpectedAccess);
  context.mock.method(TelegramClient.prototype, "iterForumTopics", unexpectedAccess);
  const stdout: string[] = [];
  const stderr: string[] = [];
  context.mock.method(console, "log", (text: string) => stdout.push(text));
  context.mock.method(process.stderr, "write", (chunk: string | Uint8Array) => {
    stderr.push(String(chunk));
    return true;
  });
  const program = new Command().option("--json");
  registerMessagesCommand(program, new MessagesListUseCase(credentialStorage, sessionStorage, createTelegramGateway));
  return { program, stdout, stderr };
}

function forumMessage(id: number, replyToId: number): TelegramMessage {
  return new TelegramMessage(
    {
      _: "message",
      id,
      out: false,
      peerId: { _: "peerChannel", channelId: 123 },
      fromId: { _: "peerUser", userId: 456 },
      date: 1_770_000_000 + id,
      message: "Read docs",
      entities: [{ _: "messageEntityTextUrl", offset: 5, length: 4, url: "https://example.com/docs" }],
      replyTo: { _: "messageReplyHeader", forumTopic: true, replyToMsgId: replyToId, replyToTopId: 42 },
      media: {
        _: "messageMediaDocument",
        document: {
          _: "document",
          id: Long.ONE,
          accessHash: Long.ONE,
          fileReference: new Uint8Array(),
          date: 1_770_000_000,
          mimeType: "application/pdf",
          size: 2048,
          dcId: 2,
          attributes: [{ _: "documentAttributeFilename", fileName: "docs.pdf" }],
        },
      },
    },
    PeersIndex.from({
      users: [{ _: "user", id: 456, firstName: "Alice" }],
      chats: [
        {
          _: "channel",
          id: 123,
          accessHash: Long.ONE,
          title: "Forum",
          photo: { _: "chatPhotoEmpty" },
          date: 0,
          megagroup: true,
          forum: true,
        },
      ],
    }),
  );
}

for (const [name, args, method] of [
  ["history", [], "getHistory"],
  ["date-bounded history", ["--after", "2026-02-01"], "getHistory"],
  ["topic read", ["--topic", "42"], "searchMessages"],
] as const) {
  test(`${name} CLI JSON preserves topic, reply, caption and media through the real use case`, async (context) => {
    const { program, stdout, stderr } = messageCommand(context);
    const earlier = forumMessage(50, 42);
    const later = forumMessage(51, 50);
    const page = context.mock.method(
      TelegramClient.prototype,
      method,
      async (_chat: unknown, options?: { reverse?: boolean }) =>
        options?.reverse ? [earlier, later] : [later, earlier],
    );

    await program.parseAsync(["--json", "messages", "-n", "2", ...args, "--", "-1000000000123"], { from: "user" });
    const messages: unknown = JSON.parse(stdout.join(""));

    assert.deepEqual(
      messages,
      [50, 51].map((id) => ({
        id,
        chatId: -1000000000123,
        senderName: "Alice",
        text: "Read docs",
        links: [{ kind: "text_link", offset: 5, length: 4, text: "docs", url: "https://example.com/docs" }],
        date: new Date((1_770_000_000 + id) * 1000).toISOString(),
        media: { type: "document", fileName: "docs.pdf", mimeType: "application/pdf", size: 2048 },
        replyToId: { 50: 42, 51: 50 }[id],
        topicId: 42,
        isOutgoing: false,
      })),
    );
    assert.equal(page.mock.callCount(), 1);
    assert.deepEqual(stderr, []);
  });
}

test("readable CLI output retains message order, topic markers, links and attachments", async (context) => {
  const { program, stdout } = messageCommand(context);
  context.mock.method(TelegramClient.prototype, "getHistory", async () => [forumMessage(51, 50), forumMessage(50, 42)]);

  await program.parseAsync(["messages", "-n", "2", "--", "-1000000000123"], { from: "user" });
  const text = stripVTControlCharacters(stdout.join(""));

  assert.match(
    text,
    /#50 \[topic:42\] Alice:\n {2}Read docs \(https:\/\/example.com\/docs\)\n {2}\[Document: docs.pdf, 2.0 KB\]/,
  );
  assert.match(text, /#50[\s\S]*#51 \[topic:42\]/);
});
