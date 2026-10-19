import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { Long, PeersIndex, TelegramClient, Message as TelegramMessage, type tl } from "@mtcute/node";
import { formatMessagesJson, formatMessagesText } from "../cli/formatters/message-formatter.js";
import { MtcuteTelegramGateway } from "./mtcute-telegram-gateway.js";

function telegramMessage(fields: Partial<tl.RawMessage> = {}): TelegramMessage {
  return new TelegramMessage(
    {
      _: "message",
      id: 42,
      peerId: { _: "peerUser", userId: 123 },
      fromId: { _: "peerUser", userId: 123 },
      date: 1_770_000_000,
      out: false,
      message: "See the runbook",
      entities: [{ _: "messageEntityTextUrl", offset: 8, length: 7, url: "https://example.com/runbook" }],
      ...fields,
    },
    PeersIndex.from({ users: [{ _: "user", id: 123, firstName: "Alice" }] }),
  );
}

test("hidden link destinations reach terminal output through the gateway", async (context) => {
  const message = telegramMessage();
  context.mock.method(TelegramClient.prototype, "getHistory", async () => [message]);
  const gateway = new MtcuteTelegramGateway({ apiId: 1, apiHash: "synthetic", sessionPath: ":memory:" });

  const messages = await gateway.getMessages({ chatId: 123, limit: 1, all: false });

  assert.match(formatMessagesText(messages), /See the runbook \(https:\/\/example\.com\/runbook\)/);
});

for (const kind of ["messageEntityUrl", "messageEntityTextUrl"] as const) {
  test(`${kind} does not repeat a destination that is already its label`, async (context) => {
    const url = "https://example.com/runbook";
    const message = telegramMessage({ message: url, entities: [{ _: kind, offset: 0, length: url.length, url }] });
    context.mock.method(TelegramClient.prototype, "getHistory", async () => [message]);
    const gateway = new MtcuteTelegramGateway({ apiId: 1, apiHash: "synthetic", sessionPath: ":memory:" });

    const messages = await gateway.getMessages({ chatId: 123, limit: 1, all: false });

    assert.equal(stripVTControlCharacters(formatMessagesText(messages)).split("\n")[1], `  ${url}`);
  });
}

test("visible URL entities retain their exact target in JSON", async (context) => {
  const url = "https://Example.com/%D0%B0?q=a%2Fb#Section";
  const message = telegramMessage({
    message: url,
    entities: [{ _: "messageEntityUrl", offset: 0, length: url.length }],
  });
  context.mock.method(TelegramClient.prototype, "getHistory", async () => [message]);
  const gateway = new MtcuteTelegramGateway({ apiId: 1, apiHash: "synthetic", sessionPath: ":memory:" });

  const messages = await gateway.getMessages({ chatId: 123, limit: 1, all: false });

  assert.deepEqual(JSON.parse(formatMessagesJson(messages)), [
    {
      id: 42,
      chatId: 123,
      senderName: "Alice",
      text: url,
      links: [{ kind: "url", offset: 0, length: url.length, text: url, url }],
      date: new Date(1_770_000_000_000).toISOString(),
      media: null,
      replyToId: null,
      isOutgoing: false,
    },
  ]);
});

for (const [offset, length] of [
  [8, 8],
  [-1, 7],
  [16, 1],
  [8, 0],
  [8, -1],
  [0.5, 7],
  [8, 0.5],
  [NaN, 7],
  [0, Infinity],
]) {
  test(`invalid link range ${offset}:${length} is rejected`, async (context) => {
    const message = telegramMessage({
      entities: [{ _: "messageEntityTextUrl", offset, length, url: "https://example.com/runbook" }],
    });
    context.mock.method(TelegramClient.prototype, "getHistory", async () => [message]);
    const gateway = new MtcuteTelegramGateway({ apiId: 1, apiHash: "synthetic", sessionPath: ":memory:" });

    await assert.rejects(gateway.getMessages({ chatId: 123, limit: 1, all: false }), {
      name: "RangeError",
      message: `Invalid link entity range in message #42: offset=${offset}, length=${length}`,
    });
  });
}

test("hidden destinations cannot emit terminal control sequences", async (context) => {
  const message = telegramMessage({
    entities: [
      { _: "messageEntityTextUrl", offset: 8, length: 7, url: "https://example.com/\u001b]8;;target\u0007\n" },
    ],
  });
  context.mock.method(TelegramClient.prototype, "getHistory", async () => [message]);
  const gateway = new MtcuteTelegramGateway({ apiId: 1, apiHash: "synthetic", sessionPath: ":memory:" });

  const messages = await gateway.getMessages({ chatId: 123, limit: 1, all: false });

  assert.equal(
    stripVTControlCharacters(formatMessagesText(messages)).split("\n")[1],
    "  See the runbook (https://example.com/\\u001b]8;;target\\u0007\\u000a)",
  );
});

test("multiple links retain UTF-16 ranges and repeated targets beneath overlapping formatting", async (context) => {
  const url = "https://example.com";
  const text = `😀 план / docs / ${url}`;
  const message = telegramMessage({
    message: text,
    entities: [
      { _: "messageEntityUrl", offset: 17, length: url.length },
      { _: "messageEntityBold", offset: 3, length: 4 },
      { _: "messageEntityTextUrl", offset: 10, length: 4, url },
      { _: "messageEntityTextUrl", offset: 3, length: 4, url },
    ],
  });
  context.mock.method(TelegramClient.prototype, "getHistory", async () => [message]);
  const gateway = new MtcuteTelegramGateway({ apiId: 1, apiHash: "synthetic", sessionPath: ":memory:" });

  const messages = await gateway.getMessages({ chatId: 123, limit: 1, all: false });
  const rendered = stripVTControlCharacters(formatMessagesText(messages)).split("\n")[1];

  assert.deepEqual(
    { text: messages[0].text, links: messages[0].links, rendered },
    {
      text,
      links: [
        { kind: "url", offset: 17, length: url.length, text: url, url },
        { kind: "text_link", offset: 10, length: 4, text: "docs", url },
        { kind: "text_link", offset: 3, length: 4, text: "план", url },
      ],
      rendered: `  😀 план (${url}) / docs (${url}) / ${url}`,
    },
  );
});

for (const route of [
  { name: "backward history", options: {}, historyIds: [42, 41], threadIds: [] },
  { name: "forward history", options: { after: new Date(1_769_999_000_000) }, historyIds: [41, 42], threadIds: [] },
  { name: "thread search", options: { threadId: 7 }, historyIds: [], threadIds: [42, 41] },
]) {
  test(`${route.name} preserves caption links and existing fields in chronological JSON`, async (context) => {
    const earlier = telegramMessage({
      id: 41,
      date: 1_769_999_999,
      message: "Earlier https://example.com",
      entities: [{ _: "messageEntityUrl", offset: 8, length: 19 }],
    });
    const caption = telegramMessage({
      out: true,
      replyTo: { _: "messageReplyHeader", replyToMsgId: 41 },
      media: {
        _: "messageMediaDocument",
        document: {
          _: "document",
          id: Long.fromNumber(9),
          accessHash: Long.fromNumber(10),
          fileReference: new Uint8Array(),
          date: 1_770_000_000,
          mimeType: "application/pdf",
          size: 2048,
          dcId: 2,
          attributes: [{ _: "documentAttributeFilename", fileName: "runbook.pdf" }],
        },
      },
    });
    const messagesById: Readonly<Record<number, TelegramMessage>> = { 41: earlier, 42: caption };
    context.mock.method(TelegramClient.prototype, "getHistory", async () =>
      route.historyIds.map((id) => messagesById[id]),
    );
    context.mock.method(TelegramClient.prototype, "searchMessages", async () =>
      route.threadIds.map((id) => messagesById[id]),
    );
    const gateway = new MtcuteTelegramGateway({ apiId: 1, apiHash: "synthetic", sessionPath: ":memory:" });

    const messages = await gateway.getMessages({ chatId: 123, limit: 2, all: false, ...route.options });
    const json: unknown = JSON.parse(formatMessagesJson(messages));

    assert.deepEqual(json, [
      {
        id: 41,
        chatId: 123,
        senderName: "Alice",
        text: "Earlier https://example.com",
        links: [{ kind: "url", offset: 8, length: 19, text: "https://example.com", url: "https://example.com" }],
        date: new Date(1_769_999_999_000).toISOString(),
        media: null,
        replyToId: null,
        isOutgoing: false,
      },
      {
        id: 42,
        chatId: 123,
        senderName: "Alice",
        text: "See the runbook",
        links: [{ kind: "text_link", offset: 8, length: 7, text: "runbook", url: "https://example.com/runbook" }],
        date: new Date(1_770_000_000_000).toISOString(),
        media: { type: "document", fileName: "runbook.pdf", mimeType: "application/pdf", size: 2048 },
        replyToId: 41,
        isOutgoing: true,
      },
    ]);
  });
}

for (const [text, entities] of [
  ["https://example.com without an entity", undefined],
  ["", undefined],
  ["https://example.com", [{ _: "messageEntityUnknown", offset: 0, length: 19 }]],
] satisfies ReadonlyArray<readonly [string, tl.TypeMessageEntity[] | undefined]>) {
  test(`non-link content ${JSON.stringify(text)} does not fabricate links`, async (context) => {
    const message = telegramMessage({ message: text, entities });
    context.mock.method(TelegramClient.prototype, "getHistory", async () => [message]);
    const gateway = new MtcuteTelegramGateway({ apiId: 1, apiHash: "synthetic", sessionPath: ":memory:" });

    const messages = await gateway.getMessages({ chatId: 123, limit: 1, all: false });

    assert.deepEqual(
      {
        text: messages[0].text,
        links: messages[0].links,
        rendered: stripVTControlCharacters(formatMessagesText(messages)).split("\n")[1],
      },
      { text: text || null, links: [], rendered: `  ${text || "[empty message]"}` },
    );
  });
}

test("service messages remain empty without links", async (context) => {
  const message = new TelegramMessage(
    {
      _: "messageService",
      id: 42,
      peerId: { _: "peerUser", userId: 123 },
      date: 1_770_000_000,
      action: { _: "messageActionChatEditTitle", title: "New title" },
    },
    PeersIndex.from({ users: [{ _: "user", id: 123, firstName: "Alice" }] }),
  );
  context.mock.method(TelegramClient.prototype, "getHistory", async () => [message]);
  const gateway = new MtcuteTelegramGateway({ apiId: 1, apiHash: "synthetic", sessionPath: ":memory:" });

  const messages = await gateway.getMessages({ chatId: 123, limit: 1, all: false });

  assert.deepEqual(
    {
      text: messages[0].text,
      links: messages[0].links,
      rendered: stripVTControlCharacters(formatMessagesText(messages)).split("\n")[1],
    },
    { text: null, links: [], rendered: "  [empty message]" },
  );
});
