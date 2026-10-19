import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import {
  Dialog,
  ForumTopic,
  Long,
  MtArgumentError,
  PeersIndex,
  TelegramClient,
  Message as TelegramMessage,
  type tl,
} from "@mtcute/node";
import { formatChatsJson, formatChatsTable } from "../cli/formatters/chat-formatter.js";
import { formatMessagesText } from "../cli/formatters/message-formatter.js";
import type { ChatType } from "../domain/entities/chat.js";
import { MtcuteTelegramGateway } from "./mtcute-telegram-gateway.js";

test("missing chat metadata preserves the provider error instead of inventing a topic", async (context) => {
  const message = new TelegramMessage(
    {
      _: "message",
      id: 51,
      peerId: { _: "peerChannel", channelId: 123 },
      date: 1_770_000_000,
      message: "Missing peer",
    },
    PeersIndex.from({}),
  );
  context.mock.method(TelegramClient.prototype, "getHistory", async () => [message]);
  const gateway = new MtcuteTelegramGateway({ apiId: 1, apiHash: "synthetic", sessionPath: ":memory:" });

  await assert.rejects(gateway.getMessages({ chatId: -1000000000123, limit: 1, all: false }), (error: unknown) => {
    assert.ok(error instanceof MtArgumentError);
    assert.equal(
      error.message,
      "Given peer is not available in this index. This is most likely an internal library error.",
    );
    return true;
  });
});

test("topic listings join by chat and topic ID while unavailable titles leave message IDs intact", async (context) => {
  const knownTopic = new ForumTopic(
    {
      _: "forumTopic",
      id: 42,
      title: "Renamed support",
      closed: true,
      pinned: false,
      date: 0,
      iconColor: 0,
      topMessage: 51,
      readInboxMaxId: 0,
      readOutboxMaxId: 0,
      unreadCount: 0,
      unreadMentionsCount: 0,
      unreadReactionsCount: 0,
      fromId: { _: "peerUser", userId: 456 },
      peer: { _: "peerChannel", channelId: 123 },
      notifySettings: { _: "peerNotifySettings" },
    },
    PeersIndex.from({}),
  );
  const unrelatedTopic = new ForumTopic({ ...knownTopic.raw, title: "Other chat", closed: false }, PeersIndex.from({}));
  const topicsByChat: Readonly<Record<string, ForumTopic>> = {
    "-1000000000123": knownTopic,
    "-1000000000999": unrelatedTopic,
  };
  const topicsRequest = context.mock.method(
    TelegramClient.prototype,
    "iterForumTopics",
    async function* (chatId: string | number) {
      yield topicsByChat[String(chatId)];
    },
  );
  const missingTitle = forumMessage({
    id: 52,
    replyTo: { _: "messageReplyHeader", forumTopic: true, replyToMsgId: 49 },
  });
  const knownTitle = forumMessage({ replyTo: { _: "messageReplyHeader", forumTopic: true, replyToMsgId: 42 } });
  context.mock.method(TelegramClient.prototype, "getHistory", async () => [missingTitle, knownTitle]);
  const gateway = new MtcuteTelegramGateway({ apiId: 1, apiHash: "synthetic", sessionPath: ":memory:" });

  const messages = await gateway.getMessages({ chatId: -1000000000123, limit: 2, all: false });
  assert.equal(topicsRequest.mock.callCount(), 0);
  const localTopics = await gateway.getTopics({ chatId: -1000000000123, limit: 5 });
  const otherTopics = await gateway.getTopics({ chatId: -1000000000999, limit: 5 });
  const topics = new Map<string, (typeof localTopics)[number]>([
    ...localTopics.map((topic) => [`-1000000000123:${topic.id}`, topic] as const),
    ...otherTopics.map((topic) => [`-1000000000999:${topic.id}`, topic] as const),
  ]);

  assert.deepEqual(
    messages.map((message) => ({
      topicId: message.topicId,
      title: topics.get(`${message.chatId}:${message.topicId}`)?.title ?? null,
      isClosed: topics.get(`${message.chatId}:${message.topicId}`)?.isClosed ?? null,
    })),
    [
      { topicId: 42, title: "Renamed support", isClosed: true },
      { topicId: 49, title: null, isClosed: null },
    ],
  );
});

for (const [name, fields, channel, expectedMarker] of [
  ["General", {}, telegramChannel({ forum: true }), "[topic:1] "],
  [
    "topic",
    { replyTo: { _: "messageReplyHeader", forumTopic: true, replyToMsgId: 42 } },
    telegramChannel({ forum: true }),
    "[topic:42] ",
  ],
  ["non-forum", {}, telegramChannel(), ""],
] satisfies ReadonlyArray<readonly [string, Partial<tl.RawMessage>, tl.TypeChat, string]>) {
  test(`${name} readable messages retain links with only known topic markers`, async (context) => {
    const message = forumMessage(fields, channel);
    context.mock.method(TelegramClient.prototype, "getHistory", async () => [message]);
    const gateway = new MtcuteTelegramGateway({ apiId: 1, apiHash: "synthetic", sessionPath: ":memory:" });

    const messages = await gateway.getMessages({ chatId: -1000000000123, limit: 1, all: false });
    const text = stripVTControlCharacters(formatMessagesText(messages));

    assert.equal(
      text.slice(text.indexOf("#51")),
      `#51 ${expectedMarker}Alice:\n  Read docs (https://example.com/docs)`,
    );
  });
}

for (const [name, action, replyTo, expectedTopic] of [
  ["topic creation", { _: "messageActionTopicCreate", title: "Support", iconColor: 0 }, undefined, 42],
  [
    "topic rename",
    { _: "messageActionTopicEdit", title: "Renamed" },
    { _: "messageReplyHeader", forumTopic: true, replyToMsgId: 42 },
    42,
  ],
  [
    "topic closure",
    { _: "messageActionTopicEdit", closed: true },
    { _: "messageReplyHeader", forumTopic: true, replyToMsgId: 50, replyToTopId: 42 },
    42,
  ],
  ["unscoped service", { _: "messageActionChatEditTitle", title: "New group title" }, undefined, null],
  ["unscoped topic edit", { _: "messageActionTopicEdit", closed: true }, undefined, null],
] satisfies ReadonlyArray<
  readonly [string, tl.TypeMessageAction, tl.TypeMessageReplyHeader | undefined, number | null]
>) {
  test(`${name} uses explicit service metadata for topic association`, async (context) => {
    const message = new TelegramMessage(
      {
        _: "messageService",
        id: 42,
        peerId: { _: "peerChannel", channelId: 123 },
        fromId: { _: "peerUser", userId: 456 },
        date: 1_770_000_000,
        action,
        replyTo,
      },
      PeersIndex.from({
        chats: [telegramChannel({ forum: true })],
        users: [{ _: "user", id: 456, firstName: "Alice" }],
      }),
    );
    context.mock.method(TelegramClient.prototype, "getHistory", async () => [message]);
    const gateway = new MtcuteTelegramGateway({ apiId: 1, apiHash: "synthetic", sessionPath: ":memory:" });

    const messages = await gateway.getMessages({ chatId: -1000000000123, limit: 1, all: false });

    assert.equal(messages[0].topicId, expectedTopic);
  });
}

for (const [name, replyTo] of [
  [
    "cross-chat topic quote",
    {
      _: "messageReplyHeader",
      forumTopic: true,
      replyToMsgId: 90,
      replyToTopId: 80,
      replyToPeerId: { _: "peerChannel", channelId: 999 },
    },
  ],
  [
    "cross-chat quote without topic header",
    { _: "messageReplyHeader", replyToMsgId: 90, replyToPeerId: { _: "peerChannel", channelId: 999 } },
  ],
  [
    "private-origin quote",
    {
      _: "messageReplyHeader",
      replyFrom: { _: "messageFwdHeader", date: 1_770_000_000, fromName: "Unknown" },
      quoteText: "Quote",
    },
  ],
  ["story reply", { _: "messageReplyStoryHeader", peer: { _: "peerUser", userId: 999 }, storyId: 9 }],
  ["scheduled reply", { _: "messageReplyHeader", replyToScheduled: true, replyToMsgId: 90 }],
  ["topic header without IDs", { _: "messageReplyHeader", forumTopic: true }],
] satisfies ReadonlyArray<readonly [string, tl.TypeMessageReplyHeader]>) {
  test(`${name} does not invent a local forum topic`, async (context) => {
    const message = forumMessage({ replyTo });
    context.mock.method(TelegramClient.prototype, "getHistory", async () => [message]);
    const gateway = new MtcuteTelegramGateway({ apiId: 1, apiHash: "synthetic", sessionPath: ":memory:" });

    const messages = await gateway.getMessages({ chatId: -1000000000123, limit: 1, all: false });

    assert.equal(messages[0].topicId, null);
  });
}

function forumMessage(
  fields: Partial<tl.RawMessage> = {},
  channel: tl.TypeChat = telegramChannel({ forum: true }),
): TelegramMessage {
  return new TelegramMessage(
    {
      _: "message",
      id: 51,
      peerId: { _: "peerChannel", channelId: 123 },
      fromId: { _: "peerUser", userId: 456 },
      date: 1_770_000_000,
      message: "Read docs",
      entities: [{ _: "messageEntityTextUrl", offset: 5, length: 4, url: "https://example.com/docs" }],
      ...fields,
    },
    PeersIndex.from({ chats: [channel], users: [{ _: "user", id: 456, firstName: "Alice" }] }),
  );
}

for (const [name, fields, channel, expectedTopic] of [
  ["General message", {}, telegramChannel({ forum: true }), 1],
  ["General reply", { replyTo: { _: "messageReplyHeader", replyToMsgId: 50 } }, telegramChannel({ forum: true }), 1],
  [
    "non-forum discussion",
    { replyTo: { _: "messageReplyHeader", replyToMsgId: 50, replyToTopId: 42 } },
    telegramChannel(),
    null,
  ],
  [
    "private reply",
    { peerId: { _: "peerUser", userId: 456 }, replyTo: { _: "messageReplyHeader", replyToMsgId: 50 } },
    telegramChannel(),
    null,
  ],
  ["incomplete peer", {}, telegramChannel({ min: true }), null],
  [
    "forbidden peer",
    {},
    { _: "channelForbidden", id: 123, accessHash: Long.ONE, title: "Unavailable", megagroup: true },
    null,
  ],
  ["gigagroup", {}, telegramChannel({ gigagroup: true }), null],
  ["monoforum", {}, telegramChannel({ monoforum: true }), null],
] satisfies ReadonlyArray<readonly [string, Partial<tl.RawMessage>, tl.TypeChat, number | null]>) {
  test(`${name} receives only an established forum topic`, async (context) => {
    const message = forumMessage(fields, channel);
    context.mock.method(TelegramClient.prototype, "getHistory", async () => [message]);
    const gateway = new MtcuteTelegramGateway({ apiId: 1, apiHash: "synthetic", sessionPath: ":memory:" });

    const messages = await gateway.getMessages({ chatId: -1000000000123, limit: 1, all: false });

    assert.equal(messages[0].topicId, expectedTopic);
  });
}

test("root and nested replies share a topic while retaining their distinct reply IDs", async (context) => {
  const rootReply = forumMessage({ id: 50, replyTo: { _: "messageReplyHeader", forumTopic: true, replyToMsgId: 42 } });
  const nestedReply = forumMessage({
    replyTo: { _: "messageReplyHeader", forumTopic: true, replyToTopId: 42, replyToMsgId: 50 },
  });
  context.mock.method(TelegramClient.prototype, "getHistory", async () => [nestedReply, rootReply]);
  const gateway = new MtcuteTelegramGateway({ apiId: 1, apiHash: "synthetic", sessionPath: ":memory:" });

  const messages = await gateway.getMessages({ chatId: -1000000000123, limit: 2, all: false });

  assert.deepEqual(
    messages.map(({ id, topicId, replyToId }) => ({ id, topicId, replyToId })),
    [
      { id: 50, topicId: 42, replyToId: 42 },
      { id: 51, topicId: 42, replyToId: 50 },
    ],
  );
});

for (const [isForum, label] of [
  [true, "yes"],
  [false, "no"],
] as const) {
  test(`supergroup table exposes forum status ${isForum} without changing its type`, async (context) => {
    const dialog = telegramDialog(
      { _: "peerChannel", channelId: 123 },
      PeersIndex.from({ chats: [telegramChannel({ forum: isForum })] }),
    );
    context.mock.method(TelegramClient.prototype, "iterDialogs", async function* () {
      yield dialog;
    });
    const gateway = new MtcuteTelegramGateway({ apiId: 1, apiHash: "synthetic", sessionPath: ":memory:" });

    const chats = await gateway.getChats({ limit: 1, offset: 0, type: "supergroup" });
    const table = stripVTControlCharacters(formatChatsTable(chats));

    assert.match(table, /Type\s+│ Forum/);
    assert.match(table, new RegExp(`supergroup\\s+│ ${label}\\s+│`));
  });
}

function telegramChannel(fields: Partial<tl.RawChannel> = {}): tl.RawChannel {
  return {
    _: "channel",
    id: 123,
    accessHash: Long.ONE,
    title: "Group",
    photo: { _: "chatPhotoEmpty" },
    date: 0,
    megagroup: true,
    ...fields,
  };
}

for (const [name, peer, peers, isForumExpected] of [
  [
    "user",
    { _: "peerUser", userId: 123 },
    PeersIndex.from({ users: [{ _: "user", id: 123, firstName: "Alice" }] }),
    false,
  ],
  [
    "group",
    { _: "peerChat", chatId: 123 },
    PeersIndex.from({ chats: [{ _: "chatForbidden", id: 123, title: "Group" }] }),
    false,
  ],
  ["supergroup", { _: "peerChannel", channelId: 123 }, PeersIndex.from({ chats: [telegramChannel()] }), false],
  [
    "channel",
    { _: "peerChannel", channelId: 123 },
    PeersIndex.from({ chats: [telegramChannel({ megagroup: false, broadcast: true })] }),
    false,
  ],
  ["forum", { _: "peerChannel", channelId: 123 }, PeersIndex.from({ chats: [telegramChannel({ forum: true })] }), true],
] satisfies ReadonlyArray<readonly [string, tl.TypePeer, PeersIndex, boolean]>) {
  test(`${name} dialogs expose an explicit forum flag in JSON`, async (context) => {
    const dialog = telegramDialog(peer, peers);
    context.mock.method(TelegramClient.prototype, "iterDialogs", async function* () {
      yield dialog;
    });
    const gateway = new MtcuteTelegramGateway({ apiId: 1, apiHash: "synthetic", sessionPath: ":memory:" });

    const chats = await gateway.getChats({ limit: 1, offset: 0 });

    assert.match(formatChatsJson(chats), new RegExp(`"isForum": ${isForumExpected}`));
  });
}

function telegramDialog(peer: tl.TypePeer, peers: PeersIndex): Dialog {
  return new Dialog(
    {
      _: "dialog",
      peer,
      topMessage: 0,
      readInboxMaxId: 0,
      readOutboxMaxId: 0,
      unreadCount: 0,
      unreadMentionsCount: 0,
      unreadReactionsCount: 0,
      notifySettings: { _: "peerNotifySettings" },
    },
    peers,
    new Map(),
  );
}

for (const [name, peer, peers, expectedType] of [
  [
    "user",
    { _: "peerUser", userId: 123 },
    PeersIndex.from({ users: [{ _: "user", id: 123, firstName: "Alice" }] }),
    "private",
  ],
  [
    "bot",
    { _: "peerUser", userId: 123 },
    PeersIndex.from({ users: [{ _: "user", id: 123, firstName: "Bot", bot: true }] }),
    "private",
  ],
  [
    "group",
    { _: "peerChat", chatId: 123 },
    PeersIndex.from({
      chats: [
        {
          _: "chat",
          id: 123,
          title: "Group",
          photo: { _: "chatPhotoEmpty" },
          participantsCount: 2,
          date: 0,
          version: 1,
        },
      ],
    }),
    "group",
  ],
  ["supergroup", { _: "peerChannel", channelId: 123 }, PeersIndex.from({ chats: [telegramChannel()] }), "supergroup"],
  [
    "channel",
    { _: "peerChannel", channelId: 123 },
    PeersIndex.from({ chats: [telegramChannel({ megagroup: false, broadcast: true })] }),
    "channel",
  ],
  [
    "gigagroup",
    { _: "peerChannel", channelId: 123 },
    PeersIndex.from({ chats: [telegramChannel({ gigagroup: true })] }),
    "supergroup",
  ],
  [
    "monoforum",
    { _: "peerChannel", channelId: 123 },
    PeersIndex.from({ chats: [telegramChannel({ monoforum: true })] }),
    "supergroup",
  ],
] satisfies ReadonlyArray<readonly [string, tl.TypePeer, PeersIndex, ChatType]>) {
  test(`${name} dialogs retain compatible chat classification`, async (context) => {
    const dialog = telegramDialog(peer, peers);
    context.mock.method(TelegramClient.prototype, "iterDialogs", async function* () {
      yield dialog;
    });
    const gateway = new MtcuteTelegramGateway({ apiId: 1, apiHash: "synthetic", sessionPath: ":memory:" });

    const chats = await gateway.getChats({ limit: 1, offset: 0 });

    assert.equal(chats[0].type, expectedType);
  });
}
