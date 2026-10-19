import assert from "node:assert/strict";
import { type TestContext, test } from "node:test";
import { Long, PeersIndex, SearchFilters, TelegramClient, Message as TelegramMessage, type tl } from "@mtcute/node";
import { Command, CommanderError } from "commander";
import type { CredentialStorage } from "../../domain/ports/credential-storage.js";
import type { SessionStorage } from "../../domain/ports/session-storage.js";
import { createTelegramGateway } from "../../infrastructure/telegram-gateway-factory.js";
import { MessagesListUseCase } from "../../use-cases/messages-list.js";
import { registerMessagesCommand } from "./messages.js";

function unexpectedAccess(): never {
  throw new Error("Unexpected external access");
}

function telegramMessage(fields: Partial<tl.RawMessage> = {}): TelegramMessage {
  return new TelegramMessage(
    {
      _: "message",
      id: 42,
      peerId: { _: "peerUser", userId: 123 },
      date: 1_770_000_000,
      message: "Read docs",
      entities: [{ _: "messageEntityTextUrl", offset: 5, length: 4, url: "https://example.com/docs" }],
      ...fields,
    },
    PeersIndex.from({ users: [{ _: "user", id: 123, firstName: "Alice" }] }),
  );
}

function commandHarness(context: TestContext) {
  let storageReads = 0;
  let exitCode = 0;
  const stdout: string[] = [];
  const stderr: string[] = [];
  const account = {
    id: 123,
    phone: "synthetic",
    firstName: "Alice",
    lastName: null,
    username: null,
    alias: "test",
    isDefault: true,
  };
  const credentialStorage: CredentialStorage = {
    getDefaultAccount: async () => {
      storageReads++;
      return account;
    },
    getAccountByAlias: async () => {
      storageReads++;
      return account;
    },
    getApiCredentials: async () => ({ apiId: 1, apiHash: "synthetic" }),
    getAccounts: unexpectedAccess,
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
  context.mock.method(console, "log", (text: string) => {
    stdout.push(text);
  });
  context.mock.method(console, "error", (text: string) => {
    stderr.push(text);
  });
  context.mock.method(process.stderr, "write", (chunk: string | Uint8Array) => {
    stderr.push(String(chunk));
    return true;
  });
  context.mock.method(process, "exit", (code?: string | number | null): never => {
    exitCode = Number(code);
    throw new Error("CLI exited");
  });
  const program = new Command().option("--json").option("--account <alias>").exitOverride();
  program.configureOutput({ writeErr: (text) => stderr.push(text) });
  registerMessagesCommand(program, new MessagesListUseCase(credentialStorage, sessionStorage, createTelegramGateway));
  return {
    async run(args: string[]) {
      try {
        await program.parseAsync(args, { from: "user" });
      } catch (error: unknown) {
        if (error instanceof CommanderError) exitCode = error.exitCode;
        else if (exitCode === 0) throw error;
      }
      return { stdout: stdout.join(""), stderr: stderr.join(""), exitCode, storageReads };
    },
  };
}

test("URL search reaches Telegram with explicit negative chat scope and preserves hidden targets", async (context) => {
  const command = commandHarness(context);
  const search = context.mock.method(TelegramClient.prototype, "searchMessages", async () =>
    Object.assign([telegramMessage()], { total: 1, next: 42 }),
  );

  const output = await command.run(["--json", "messages", "--filter", "url", "-n", "1", "--", "-1001234567890"]);

  assert.equal(output.exitCode, 0, output.stderr);
  assert.deepEqual(search.mock.calls[0]?.arguments[0], {
    chatId: -1001234567890,
    threadId: undefined,
    limit: 1,
    offset: 0,
    filter: SearchFilters.Url,
    query: undefined,
    fromUser: undefined,
    minDate: undefined,
    maxDate: undefined,
  });
  assert.match(output.stdout, /https:\/\/example.com\/docs/);
  assert.equal(output.stderr, "");
});

function documentMedia(attributes: tl.TypeDocumentAttribute[], mimeType: string): tl.TypeMessageMedia {
  return {
    _: "messageMediaDocument",
    document: {
      _: "document",
      id: Long.fromNumber(9),
      accessHash: Long.fromNumber(10),
      fileReference: new Uint8Array(),
      date: 1_770_000_000,
      mimeType,
      size: 2048,
      dcId: 2,
      attributes: [{ _: "documentAttributeFilename", fileName: "sample" }, ...attributes],
    },
  };
}

const categoryCases = [
  ["url", "inputMessagesFilterUrl", undefined, null, "Read docs (https://example.com/docs)"],
  [
    "photo",
    "inputMessagesFilterPhotos",
    {
      _: "messageMediaPhoto",
      photo: {
        _: "photo",
        id: Long.fromNumber(9),
        accessHash: Long.fromNumber(10),
        fileReference: new Uint8Array(),
        date: 1_770_000_000,
        dcId: 2,
        sizes: [{ _: "photoSize", type: "x", w: 20, h: 20, size: 2048 }],
      },
    },
    "photo",
    "[Photo]",
  ],
  [
    "video",
    "inputMessagesFilterVideo",
    documentMedia([{ _: "documentAttributeVideo", duration: 1, w: 20, h: 20 }], "video/mp4"),
    "video",
    "[Video: sample, 2.0 KB]",
  ],
  [
    "photo-video",
    "inputMessagesFilterPhotoVideo",
    documentMedia([{ _: "documentAttributeVideo", duration: 1, w: 20, h: 20 }], "video/mp4"),
    "video",
    "[Video: sample, 2.0 KB]",
  ],
  [
    "document",
    "inputMessagesFilterDocument",
    documentMedia([], "application/pdf"),
    "document",
    "[Document: sample, 2.0 KB]",
  ],
  [
    "gif",
    "inputMessagesFilterGif",
    documentMedia(
      [{ _: "documentAttributeVideo", duration: 1, w: 20, h: 20 }, { _: "documentAttributeAnimated" }],
      "video/mp4",
    ),
    "animation",
    "[GIF]",
  ],
  [
    "voice",
    "inputMessagesFilterVoice",
    documentMedia([{ _: "documentAttributeAudio", duration: 1, voice: true }], "audio/ogg"),
    "voice",
    "[Voice]",
  ],
  [
    "audio",
    "inputMessagesFilterMusic",
    documentMedia([{ _: "documentAttributeAudio", duration: 1 }], "audio/mpeg"),
    "audio",
    "[Audio: sample]",
  ],
  [
    "video-note",
    "inputMessagesFilterRoundVideo",
    documentMedia([{ _: "documentAttributeVideo", duration: 1, w: 20, h: 20, roundMessage: true }], "video/mp4"),
    "video_note",
    "[Video message]",
  ],
  ["pinned", "inputMessagesFilterPinned", undefined, null, "Read docs (https://example.com/docs)"],
] satisfies ReadonlyArray<
  readonly [string, tl.TypeMessagesFilter["_"], tl.TypeMessageMedia | undefined, string | null, string]
>;

for (const [category, filter, media, , placeholder] of categoryCases) {
  test(`${category} category returns formatted server matches without fetching unrelated history`, async (context) => {
    const command = commandHarness(context);
    const serverMessages = [
      { filter, message: telegramMessage({ id: 44, media }) },
      { filter: "unrelated", message: telegramMessage({ id: 43, message: "Unrelated", entities: [] }) },
      { filter, message: telegramMessage({ id: 42, media }) },
    ];
    context.mock.method(
      TelegramClient.prototype,
      "searchMessages",
      async (params: Parameters<TelegramClient["searchMessages"]>[0]) => {
        const matches = serverMessages
          .filter((entry) => entry.filter === params?.filter?._)
          .map((entry) => entry.message);
        return Object.assign(matches, { total: matches.length, next: matches.at(-1)?.id });
      },
    );
    const download = context.mock.method(TelegramClient.prototype, "downloadToFile", unexpectedAccess);

    const output = await command.run(["messages", "123", "--filter", category, "-n", "2"]);

    assert.equal(output.exitCode, 0, output.stderr);
    assert.ok(output.stdout.includes(placeholder), output.stdout);
    assert.match(output.stdout, /#42[\s\S]*#44/);
    assert.doesNotMatch(output.stdout, /Unrelated/);
    assert.equal(download.mock.callCount(), 0);
  });
}

for (const [sender, resolvedSender] of [
  ["456", 456],
  ["@alice", "@alice"],
] as const) {
  test(`query, sender ${sender}, topic and date bounds combine in the search request`, async (context) => {
    const command = commandHarness(context);
    const search = context.mock.method(TelegramClient.prototype, "searchMessages", async () =>
      Object.assign([telegramMessage()], { total: 1, next: 42 }),
    );

    const output = await command.run([
      "--json",
      "--account",
      "test",
      "messages",
      "--filter",
      "url",
      "--query",
      "Read",
      "--from",
      sender,
      "--topic",
      "7",
      "--after",
      "2026-02-02T05:40:00+03:00",
      "--before",
      "2026-02-02T02:40:01Z",
      "-n",
      "1",
      "--",
      "-1001234567890",
    ]);

    assert.equal(output.exitCode, 0, output.stderr);
    assert.deepEqual(search.mock.calls[0]?.arguments[0], {
      chatId: -1001234567890,
      threadId: 7,
      limit: 1,
      offset: 0,
      filter: SearchFilters.Url,
      query: "Read",
      fromUser: resolvedSender,
      minDate: new Date("2026-02-02T02:39:59Z"),
      maxDate: new Date("2026-02-02T02:40:01Z"),
    });
    assert.deepEqual(messageIds(output.stdout), [42]);
    assert.equal(output.stderr, "");
  });
}

test("search fills N across short pages using returned cursors and retaining every constraint", async (context) => {
  const command = commandHarness(context);
  const pages: Readonly<Record<number, Awaited<ReturnType<TelegramClient["searchMessages"]>>>> = {
    0: Object.assign(
      [telegramMessage({ id: 46, date: 1_770_000_003 }), telegramMessage({ id: 45, date: 1_770_000_002 })],
      { total: 4, next: 44 },
    ),
    44: Object.assign(
      [telegramMessage({ id: 45, date: 1_770_000_002 }), telegramMessage({ id: 43, date: 1_770_000_001 })],
      { total: 4, next: 42 },
    ),
    42: Object.assign([telegramMessage({ id: 41, date: 1_770_000_000 })], { total: 4, next: 40 }),
  };
  const search = context.mock.method(
    TelegramClient.prototype,
    "searchMessages",
    async (params: Parameters<TelegramClient["searchMessages"]>[0]) => pages[params?.offset ?? 0] ?? unexpectedAccess(),
  );

  const output = await command.run([
    "--json",
    "messages",
    "123",
    "--filter",
    "url",
    "--query",
    "Read",
    "--from",
    "456",
    "--topic",
    "7",
    "--after",
    "2026-02-02T02:40:00Z",
    "--before",
    "2026-02-02T02:40:03Z",
    "-n",
    "3",
  ]);

  assert.equal(output.exitCode, 0, output.stderr);
  assert.deepEqual(messageIds(output.stdout), [41, 43, 45]);
  const constraints = {
    chatId: 123,
    filter: SearchFilters.Url,
    query: "Read",
    fromUser: 456,
    threadId: 7,
    minDate: new Date("2026-02-02T02:39:59Z"),
    maxDate: new Date("2026-02-02T02:40:03Z"),
  };
  assert.deepEqual(
    search.mock.calls.map((call) => call.arguments[0]),
    [
      { ...constraints, offset: 0, limit: 3 },
      { ...constraints, offset: 44, limit: 2 },
      { ...constraints, offset: 42, limit: 1 },
    ],
  );
});

for (const [options, expectedError] of [
  [["-n", "-1"], "Invalid count"],
  [["-n", "1.5"], "Invalid count"],
  [["-n", "abc"], "Invalid count"],
  [["-n", "Infinity"], "Invalid count"],
  [["-n", "NaN"], "Invalid count"],
  [["-n", "1x"], "Invalid count"],
  [["-n", "9007199254740992"], "Invalid count"],
  [["-n", "-1", "--all"], "Invalid count"],
  [["--topic", "0"], "Invalid topic ID"],
  [["--topic", "-2"], "Invalid topic ID"],
  [["--topic", "1.5"], "Invalid topic ID"],
  [["--topic", "seven"], "Invalid topic ID"],
  [["--topic", "2147483648"], "Invalid topic ID"],
  [["--filter", "sticker"], "Allowed choices"],
  [["--query", ""], "Query must not be empty"],
  [["--query", "  "], "Query must not be empty"],
  [["--from", ""], "Sender must not be empty"],
  [["--from", "  "], "Sender must not be empty"],
] satisfies ReadonlyArray<readonly [string[], string]>) {
  test(`invalid input ${JSON.stringify(options)} fails before account or Telegram access`, async (context) => {
    const command = commandHarness(context);

    const output = await command.run(["--json", "messages", "123", ...options]);

    assert.deepEqual(
      {
        exitCode: output.exitCode,
        stdout: output.stdout,
        storageReads: output.storageReads,
        hasError: output.stderr.includes(expectedError),
      },
      { exitCode: 1, stdout: "", storageReads: 0, hasError: true },
      output.stderr,
    );
  });
}

for (const [options, expectedError] of [
  [["--after", "2026-02-30"], "Invalid date"],
  [["--after", "2026-02-02T02:40:00.0001Z"], "Invalid date"],
  [["--before", "2026-02-02T02:40:00.0001Z"], "Invalid date"],
  [["--before", "2025-02-29"], "Invalid date"],
  [["--after", "2026-04-31T12:00"], "Invalid date"],
  [["--after", "25:00"], "Invalid date"],
  [["--before", "10:60"], "Invalid date"],
  [["--after", "2026-01-01T24:00"], "Invalid date"],
  [["--after", "2026-01-01T12:00:60Z"], "Invalid date"],
  [["--before", "2026-13-01"], "Invalid date"],
  [["--after", "2026-01-01T12:00+24:00"], "Invalid date"],
  [["--after", ""], "Invalid date"],
  [["--before", "nonsense"], "Invalid date"],
  [["--after", "2026-02-02", "--before", "2026-02-01"], "--after must be earlier than --before"],
  [["--after", "2026-02-02", "--before", "2026-02-02"], "--after must be earlier than --before"],
] satisfies ReadonlyArray<readonly [string[], string]>) {
  test(`invalid date bounds ${JSON.stringify(options)} fail before account access`, async (context) => {
    const command = commandHarness(context);

    const output = await command.run(["--json", "messages", "123", ...options]);

    assert.deepEqual(
      {
        exitCode: output.exitCode,
        stdout: output.stdout,
        storageReads: output.storageReads,
        hasError: output.stderr.includes(expectedError),
      },
      { exitCode: 1, stdout: "", storageReads: 0, hasError: true },
      output.stderr,
    );
  });
}

for (const chatArguments of [[], [""], ["   "]]) {
  test(`chat scope ${JSON.stringify(chatArguments)} cannot initiate a global search`, async (context) => {
    const command = commandHarness(context);

    const output = await command.run(["--json", "messages", "--filter", "url", ...chatArguments]);

    assert.deepEqual(
      { exitCode: output.exitCode, stdout: output.stdout, storageReads: output.storageReads },
      { exitCode: 1, stdout: "", storageReads: 0 },
    );
    assert.match(output.stderr, /chat/i);
  });
}

test("zero matches returns an empty JSON array without account or Telegram access", async (context) => {
  const command = commandHarness(context);

  const output = await command.run([
    "--json",
    "messages",
    "123",
    "--filter",
    "url",
    "--after",
    "2026-02-02",
    "-n",
    "0",
  ]);

  assert.deepEqual(output, { exitCode: 0, stdout: "[]", stderr: "", storageReads: 0 });
});

function messageIds(stdout: string): number[] {
  const messages: unknown = JSON.parse(stdout);
  assert.ok(Array.isArray(messages));
  return messages.map((message: unknown) => {
    assert.ok(typeof message === "object" && message !== null && "id" in message && typeof message.id === "number");
    return message.id;
  });
}

for (const options of [
  ["--query", "Read"],
  ["--from", "456"],
  ["--topic", "7"],
]) {
  test(`standalone ${options[0]} uses chat-scoped search`, async (context) => {
    const command = commandHarness(context);
    const search = context.mock.method(TelegramClient.prototype, "searchMessages", async () =>
      Object.assign([telegramMessage()], { total: 1, next: 42 }),
    );

    const output = await command.run(["--json", "messages", "123", ...options, "-n", "1"]);

    assert.equal(output.exitCode, 0, output.stderr);
    assert.deepEqual(messageIds(output.stdout), [42]);
    assert.equal(search.mock.calls[0]?.arguments[0]?.chatId, 123);
  });
}

for (const count of ["0", "1"]) {
  test(`all overrides count ${count} and continues past a short page to exhaustion`, async (context) => {
    const command = commandHarness(context);
    const search = context.mock.method(
      TelegramClient.prototype,
      "searchMessages",
      async (params: Parameters<TelegramClient["searchMessages"]>[0]) => {
        const pages: Readonly<Record<number, TelegramMessage[]>> = {
          0: [telegramMessage({ id: 44 })],
          44: [telegramMessage({ id: 42 })],
          42: [],
        };
        const messages = pages[params?.offset ?? 0] ?? unexpectedAccess();
        return Object.assign(messages, { total: 2, next: messages.at(-1)?.id });
      },
    );

    const output = await command.run(["--json", "messages", "123", "--filter", "url", "--all", "-n", count]);

    assert.equal(output.exitCode, 0, output.stderr);
    assert.deepEqual(messageIds(output.stdout), [42, 44]);
    assert.deepEqual(
      search.mock.calls.map((call) => call.arguments[0]?.limit),
      [100, 100, 100],
    );
    assert.equal(output.stderr, "");
  });
}

for (const route of ["search", "history"] as const) {
  test(`${route} reports an empty result without turning it into an error`, async (context) => {
    const command = commandHarness(context);
    context.mock.method(TelegramClient.prototype, "searchMessages", async () => Object.assign([], { total: 0 }));
    context.mock.method(TelegramClient.prototype, "getHistory", async () => Object.assign([], { total: 0 }));
    const options = { search: ["--filter", "url"], history: [] }[route];

    const output = await command.run(["--json", "messages", "123", ...options]);

    assert.equal(output.exitCode, 0, output.stderr);
    assert.deepEqual(messageIds(output.stdout), []);
  });

  test(`${route} reports a repeated cursor without returning misleading partial JSON`, async (context) => {
    const command = commandHarness(context);
    const search = context.mock.method(TelegramClient.prototype, "searchMessages", async () =>
      Object.assign([telegramMessage()], { total: 5, next: 42 }),
    );
    const history = context.mock.method(TelegramClient.prototype, "getHistory", async () =>
      Object.assign([telegramMessage()], { total: 5, next: { id: 42, date: 1_770_000_000 } }),
    );
    const options = { search: ["--filter", "url"], history: [] }[route];

    const output = await command.run(["--json", "messages", "123", ...options, "--all"]);

    assert.deepEqual({ exitCode: output.exitCode, stdout: output.stdout }, { exitCode: 1, stdout: "" });
    assert.match(output.stderr, /Telegram pagination did not advance/);
    assert.equal(search.mock.callCount() + history.mock.callCount(), 2);
  });
}

test("date-bounded history starts at the upper bound and stops after N latest matches", async (context) => {
  const command = commandHarness(context);
  const history = context.mock.method(TelegramClient.prototype, "getHistory", async () =>
    Object.assign([telegramMessage({ id: 44 }), telegramMessage({ id: 43 })], {
      total: 10000,
      next: { id: 43, date: 1_770_000_000 },
    }),
  );

  const output = await command.run([
    "--json",
    "messages",
    "123",
    "--after",
    "2026-01-01",
    "--before",
    "2026-02-03",
    "-n",
    "2",
  ]);

  assert.equal(output.exitCode, 0, output.stderr);
  assert.deepEqual(messageIds(output.stdout), [43, 44]);
  assert.deepEqual(
    history.mock.calls.map((call) => call.arguments),
    [[123, { limit: 2, offset: { id: 0, date: Date.parse("2026-02-03") / 1000 } }]],
  );
});

for (const route of ["search", "history"] as const) {
  test(`${route} includes the exact after boundary and stops before older messages`, async (context) => {
    const command = commandHarness(context);
    const messages = [telegramMessage(), telegramMessage({ id: 41, date: 1_769_999_999 })];
    const search = context.mock.method(TelegramClient.prototype, "searchMessages", async () =>
      Object.assign([...messages], { total: 100, next: 41 }),
    );
    const history = context.mock.method(TelegramClient.prototype, "getHistory", async () =>
      Object.assign([...messages], { total: 100, next: { id: 41, date: 1_769_999_999 } }),
    );
    const options = { search: ["--filter", "url"], history: [] }[route];

    const output = await command.run([
      "--json",
      "messages",
      "123",
      ...options,
      "--after",
      "2026-02-02T02:40:00Z",
      "--all",
    ]);

    assert.equal(output.exitCode, 0, output.stderr);
    assert.deepEqual(messageIds(output.stdout), [42]);
    assert.equal(search.mock.callCount() + history.mock.callCount(), 1);
  });
}

for (const [argument, date] of [
  ["2024-02-29", new Date("2024-02-29T00:00:00Z")],
  ["2026-02-02T10:15", new Date(2026, 1, 2, 10, 15)],
  ["2026-02-02 10:15", new Date(2026, 1, 2, 10, 15)],
  ["2026-02-02T10:15:30.125+03:00", new Date("2026-02-02T07:15:30.125Z")],
  ["9:15", new Date(2026, 1, 2, 9, 15)],
] as const) {
  test(`date ${argument} retains its documented timezone and second precision`, async (context) => {
    const command = commandHarness(context);
    context.mock.timers.enable({ apis: ["Date"], now: new Date(2026, 1, 2, 12) });
    const search = context.mock.method(TelegramClient.prototype, "searchMessages", async () =>
      Object.assign([], { total: 0 }),
    );

    const output = await command.run(["--json", "messages", "123", "--filter", "url", "--after", argument]);

    assert.equal(output.exitCode, 0, output.stderr);
    assert.equal(search.mock.calls[0]?.arguments[0]?.minDate?.valueOf(), (Math.ceil(date.getTime() / 1000) - 1) * 1000);
  });
}

for (const [failure, exitCode] of [
  ["Peer with username missing was not found", 1],
  ["NETWORK_TIMEOUT", 1],
  ["Session expired", 2],
] as const) {
  test(`search failure ${failure} preserves stderr and disconnects`, async (context) => {
    const command = commandHarness(context);
    context.mock.method(TelegramClient.prototype, "searchMessages", async () => {
      throw new Error(failure);
    });
    const disconnect = context.mock.method(TelegramClient.prototype, "destroy", async () => {});

    const output = await command.run(["--json", "messages", "123", "--from", "@missing"]);

    assert.deepEqual({ exitCode: output.exitCode, stdout: output.stdout }, { exitCode, stdout: "" });
    assert.ok(output.stderr.includes(failure), output.stderr);
    assert.equal(disconnect.mock.callCount(), 1);
  });
}

test("future date bounds do not wrap mtcute's signed 32-bit timestamps", async (context) => {
  const command = commandHarness(context);
  const search = context.mock.method(TelegramClient.prototype, "searchMessages", async () =>
    Object.assign([telegramMessage()], { total: 1, next: 42 }),
  );

  const output = await command.run([
    "--json",
    "messages",
    "123",
    "--filter",
    "url",
    "--before",
    "2040-01-01",
    "-n",
    "1",
  ]);

  assert.equal(output.exitCode, 0, output.stderr);
  assert.deepEqual(messageIds(output.stdout), [42]);
  assert.equal(search.mock.calls[0]?.arguments[0]?.maxDate, undefined);
});

for (const [category, , media, mediaType] of categoryCases.filter((entry) => entry[2] !== undefined)) {
  test(`${category} JSON retains attachment metadata through the shared mapper`, async (context) => {
    const command = commandHarness(context);
    context.mock.method(TelegramClient.prototype, "searchMessages", async () =>
      Object.assign([telegramMessage({ media })], { total: 1, next: 42 }),
    );

    const output = await command.run(["--json", "messages", "123", "--filter", category, "-n", "1"]);
    const messages: unknown = JSON.parse(output.stdout);

    assert.equal(output.exitCode, 0, output.stderr);
    assert.ok(Array.isArray(messages));
    const attachments = messages.map((message: unknown) => {
      assert.ok(typeof message === "object" && message !== null && "media" in message);
      return message.media;
    });
    assert.deepEqual(attachments, [
      {
        type: mediaType,
        fileName: category === "photo" ? null : "sample",
        mimeType: {
          photo: "image/jpeg",
          video: "video/mp4",
          "photo-video": "video/mp4",
          document: "application/pdf",
          gif: "video/mp4",
          voice: "audio/ogg",
          audio: "audio/mpeg",
          "video-note": "video/mp4",
        }[category],
        size: 2048,
      },
    ]);
  });
}

test("legacy GIF metadata maps to animation", async (context) => {
  const command = commandHarness(context);
  const media = documentMedia([{ _: "documentAttributeImageSize", w: 20, h: 20 }], "image/gif");
  context.mock.method(TelegramClient.prototype, "searchMessages", async () =>
    Object.assign([telegramMessage({ media })], { total: 1, next: 42 }),
  );

  const output = await command.run(["messages", "123", "--filter", "gif", "-n", "1"]);

  assert.equal(output.exitCode, 0, output.stderr);
  assert.match(output.stdout, /\[GIF\]/);
});

test("fractional search dates preserve the exact selected interval on the server", async (context) => {
  const command = commandHarness(context);
  const search = context.mock.method(
    TelegramClient.prototype,
    "searchMessages",
    async (params: Parameters<TelegramClient["searchMessages"]>[0]) => {
      const messages = [
        telegramMessage({ id: 44, date: 1_770_000_002 }),
        telegramMessage({ id: 43, date: 1_770_000_001 }),
        telegramMessage(),
      ].filter(
        (message) =>
          message.date.getTime() > (params?.minDate?.valueOf() ?? 0) &&
          message.date.getTime() < (params?.maxDate?.valueOf() ?? Infinity),
      );
      return Object.assign(messages, { total: messages.length, next: messages.at(-1)?.id });
    },
  );

  const output = await command.run([
    "--json",
    "messages",
    "123",
    "--filter",
    "url",
    "--after",
    "2026-02-02T02:40:00.500Z",
    "--before",
    "2026-02-02T02:40:01.500Z",
    "-n",
    "1",
  ]);

  assert.equal(output.exitCode, 0, output.stderr);
  assert.deepEqual(messageIds(output.stdout), [43]);
  assert.deepEqual(search.mock.calls[0]?.arguments[0]?.maxDate, new Date("2026-02-02T02:40:02Z"));
});

test("history uses returned cursors across short pages without counting duplicate boundary records", async (context) => {
  const command = commandHarness(context);
  const history = context.mock.method(
    TelegramClient.prototype,
    "getHistory",
    async (_chat: unknown, params: Parameters<TelegramClient["getHistory"]>[1]) => {
      const pages = new Map([
        [0, { messages: [telegramMessage({ id: 45 })], next: { id: 44, date: 1_770_000_000 } }],
        [
          44,
          {
            messages: [telegramMessage({ id: 45 }), telegramMessage({ id: 43 })],
            next: { id: 42, date: 1_770_000_000 },
          },
        ],
        [42, { messages: [telegramMessage({ id: 41 })], next: { id: 40, date: 1_770_000_000 } }],
      ]);
      const page = pages.get(params?.offset?.id ?? 0) ?? unexpectedAccess();
      return Object.assign(page.messages, { total: 10, next: page.next });
    },
  );

  const output = await command.run(["--json", "messages", "123", "--after", "2026-02-01", "-n", "3"]);

  assert.equal(output.exitCode, 0, output.stderr);
  assert.deepEqual(messageIds(output.stdout), [41, 43, 45]);
  assert.deepEqual(
    history.mock.calls.map((call) => call.arguments[1]),
    [
      { limit: 3, offset: undefined },
      { limit: 2, offset: { id: 44, date: 1_770_000_000 } },
      { limit: 1, offset: { id: 42, date: 1_770_000_000 } },
    ],
  );
});

test("large searches request at most 100 messages per page and stop at N", async (context) => {
  const command = commandHarness(context);
  const search = context.mock.method(
    TelegramClient.prototype,
    "searchMessages",
    async (params: Parameters<TelegramClient["searchMessages"]>[0]) => {
      const newestId = (params?.offset || 1001) - 1;
      const messages = Array.from({ length: params?.limit ?? 0 }, (_, index) =>
        telegramMessage({ id: newestId - index }),
      );
      return Object.assign(messages, { total: 10000, next: messages.at(-1)?.id });
    },
  );

  const output = await command.run(["--json", "messages", "123", "--query", "Read", "-n", "102"]);

  assert.equal(output.exitCode, 0, output.stderr);
  assert.equal(messageIds(output.stdout).length, 102);
  assert.deepEqual(
    search.mock.calls.map((call) => call.arguments[0]?.limit),
    [100, 2],
  );
});

for (const options of [[], ["--filter", "url"]]) {
  test(`an interval ending at the Unix epoch skips retrieval ${JSON.stringify(options)}`, async (context) => {
    const command = commandHarness(context);

    const output = await command.run(["--json", "messages", "123", ...options, "--before", "1970-01-01", "-n", "2"]);

    assert.equal(output.exitCode, 0, output.stderr);
    assert.deepEqual(messageIds(output.stdout), []);
  });
}
