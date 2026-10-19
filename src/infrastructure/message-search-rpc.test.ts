import assert from "node:assert/strict";
import { type TestContext, test } from "node:test";
import { BaseTelegramClient, type tl } from "@mtcute/node";
import { MtcuteTelegramGateway } from "./mtcute-telegram-gateway.js";

function telegramMessage(id: number): tl.RawMessage {
  return {
    _: "message",
    id,
    peerId: { _: "peerUser", userId: 123 },
    date: 1_770_000_000 + id - 1000,
    message: "Synthetic message",
  };
}

function installSearchRpc(
  context: TestContext,
  history: readonly tl.RawMessage[],
  requests: tl.messages.RawSearchRequest[],
): void {
  context.mock.method(
    BaseTelegramClient.prototype,
    "call",
    async (request: tl.RpcMethod): Promise<tl.messages.TypeMessages> => {
      if (request._ !== "messages.search") throw new Error(`Unexpected RPC: ${request._}`);
      requests.push(request);
      const matches = history.filter(
        (message) =>
          (request.offsetId === 0 || message.id < request.offsetId) &&
          (request.minDate === 0 || message.date > request.minDate) &&
          (request.maxDate === 0 || message.date < request.maxDate),
      );
      return {
        _: "messages.messagesSlice",
        count: matches.length,
        messages: matches.slice(0, request.limit),
        topics: [],
        chats: [],
        users: [{ _: "user", id: 123, firstName: "Alice" }],
      };
    },
  );
}

test("real mtcute search returns the latest 150 matches across changing page sizes", async (context) => {
  const history = Array.from({ length: 549 }, (_, index) => telegramMessage(1000 - index));
  const requests: tl.messages.RawSearchRequest[] = [];
  installSearchRpc(context, history, requests);
  const gateway = new MtcuteTelegramGateway({ apiId: 1, apiHash: "synthetic", sessionPath: ":memory:" });

  const messages = await gateway.getMessages({ chatId: "self", limit: 150, all: false, query: "Synthetic" });

  assert.deepEqual(
    messages.map((message) => message.id),
    Array.from({ length: 150 }, (_, index) => 851 + index),
  );
  assert.deepEqual(
    requests.map(({ offsetId, limit }) => ({ offsetId, limit })),
    [
      { offsetId: 0, limit: 100 },
      { offsetId: 901, limit: 50 },
    ],
  );
});

test("real mtcute search keeps the before bound while exhausting numeric cursors", async (context) => {
  const history = Array.from({ length: 205 }, (_, index) => telegramMessage(1000 - index));
  const requests: tl.messages.RawSearchRequest[] = [];
  installSearchRpc(context, history, requests);
  const gateway = new MtcuteTelegramGateway({ apiId: 1, apiHash: "synthetic", sessionPath: ":memory:" });

  const messages = await gateway.getMessages({
    chatId: "self",
    limit: 1,
    all: true,
    query: "Synthetic",
    before: new Date(1_769_999_997_000),
  });

  assert.deepEqual(
    messages.map((message) => message.id),
    Array.from({ length: 201 }, (_, index) => 796 + index),
  );
  assert.deepEqual(
    requests.map(({ offsetId, maxDate }) => ({ offsetId, maxDate })),
    [
      { offsetId: 0, maxDate: 1_769_999_997 },
      { offsetId: 897, maxDate: 1_769_999_997 },
      { offsetId: 797, maxDate: 1_769_999_997 },
      { offsetId: 796, maxDate: 1_769_999_997 },
    ],
  );
});

for (const [after, before, expectedIds] of [
  ["2026-02-02T05:40:00+03:00", "2026-02-02T02:40:01Z", [1000]],
  ["2026-02-02T02:40:00.500Z", "2026-02-02T02:40:01.500Z", [1001]],
  ["2026-02-02T02:40:00.125Z", "2026-02-02T02:40:00.875Z", []],
] as const) {
  test(`real mtcute search preserves the interval [${after}, ${before})`, async (context) => {
    const history = [1001, 1000, 999].map(telegramMessage);
    const requests: tl.messages.RawSearchRequest[] = [];
    installSearchRpc(context, history, requests);
    const gateway = new MtcuteTelegramGateway({ apiId: 1, apiHash: "synthetic", sessionPath: ":memory:" });

    const messages = await gateway.getMessages({
      chatId: "self",
      limit: 10,
      all: false,
      query: "Synthetic",
      after: new Date(after),
      before: new Date(before),
    });

    assert.deepEqual(
      messages.map((message) => message.id),
      expectedIds,
    );
  });
}
