import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { type TestContext, test } from "node:test";
import { CommanderError } from "commander";
import type { CredentialStorage } from "../domain/ports/credential-storage.js";
import type { SessionStorage } from "../domain/ports/session-storage.js";
import { AccountsListUseCase } from "../use-cases/accounts-list.js";
import { AccountsRenameUseCase } from "../use-cases/accounts-rename.js";
import { AuthUseCase } from "../use-cases/auth.js";
import { ChatsListUseCase } from "../use-cases/chats-list.js";
import { DownloadMediaUseCase } from "../use-cases/download-media.js";
import { LogoutUseCase } from "../use-cases/logout.js";
import { MessagesListUseCase } from "../use-cases/messages-list.js";
import { SetDefaultAccountUseCase } from "../use-cases/set-default-account.js";
import { TopicsListUseCase } from "../use-cases/topics-list.js";
import { createApp } from "./app.js";

function unexpectedAccess(): never {
  throw new Error("Unexpected external access");
}

function application(credentialStorage: CredentialStorage) {
  const sessionStorage: SessionStorage = {
    getSessionPath: unexpectedAccess,
    sessionExists: unexpectedAccess,
    removeSession: unexpectedAccess,
  };
  return createApp({
    auth: new AuthUseCase(credentialStorage, sessionStorage, unexpectedAccess),
    logout: new LogoutUseCase(credentialStorage, sessionStorage, unexpectedAccess),
    accountsList: new AccountsListUseCase(credentialStorage),
    accountsRename: new AccountsRenameUseCase(credentialStorage),
    setDefault: new SetDefaultAccountUseCase(credentialStorage),
    chatsList: new ChatsListUseCase(credentialStorage, sessionStorage, unexpectedAccess),
    messagesList: new MessagesListUseCase(credentialStorage, sessionStorage, unexpectedAccess),
    downloadMedia: new DownloadMediaUseCase(credentialStorage, sessionStorage, unexpectedAccess),
    topicsList: new TopicsListUseCase(credentialStorage, sessionStorage, unexpectedAccess),
  });
}

function commandHarness(context: TestContext, storage: Partial<CredentialStorage> = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const program = application({
    getDefaultAccount: async () => null,
    getAccountByAlias: async () => null,
    getAccounts: async () => [],
    getApiCredentials: unexpectedAccess,
    saveAccount: unexpectedAccess,
    removeAccount: unexpectedAccess,
    setDefault: unexpectedAccess,
    isAliasAvailable: unexpectedAccess,
    renameAlias: unexpectedAccess,
    saveApiCredentials: unexpectedAccess,
    ...storage,
  });
  context.mock.method(console, "log", (message: string) => stdout.push(`${message}\n`));
  context.mock.method(console, "error", (message: string) => stderr.push(`${message}\n`));
  context.mock.method(process.stdout, "write", (chunk: string | Uint8Array) => {
    stdout.push(String(chunk));
    return true;
  });
  context.mock.method(process.stderr, "write", (chunk: string | Uint8Array) => {
    stderr.push(String(chunk));
    return true;
  });
  context.mock.method(process, "exit", (code?: string | number | null): never => {
    throw new CommanderError(Number(code), "test.exit", "CLI exited");
  });
  return {
    async run(args: string[]) {
      let exitCode = 0;
      try {
        await program.parseAsync(args, { from: "user" });
      } catch (error: unknown) {
        if (!(error instanceof CommanderError)) throw error;
        exitCode = error.exitCode;
      }
      return { stdout: stdout.join(""), stderr: stderr.join(""), exitCode };
    },
  };
}

const failureCases = [
  { args: ["accounts", "list"], error: "Storage unavailable", code: 1 },
  { args: ["auth"], error: "Unexpected external access", code: 1 },
  { args: ["logout", "missing"], error: 'Account "missing" not found', code: 1 },
  { args: ["default", "missing"], error: 'Account "missing" not found', code: 1 },
  { args: ["accounts", "rename", "missing", "new"], error: 'Account "missing" not found', code: 1 },
  { args: ["chats"], error: "No default account. Use 'tg default <alias>' or --account flag.", code: 2 },
  { args: ["topics", "123"], error: "No default account. Use 'tg default <alias>' or --account flag.", code: 2 },
  {
    args: ["download", "123", "42"],
    error: "No default account. Use 'tg default <alias>' or --account flag.",
    code: 2,
  },
  {
    args: ["chats", "--type", "invalid"],
    error: "Invalid chat type. Use: private, group, supergroup, channel",
    code: 1,
  },
];

for (const { args, error, code } of failureCases) {
  test(`JSON ${args.join(" ")} failures retain their exit code`, async (context) => {
    const command = commandHarness(context, {
      getAccounts: async () => {
        throw new Error("Storage unavailable");
      },
    });

    const output = await command.run(["--json", ...args]);

    assert.deepEqual(output, { stdout: "", stderr: `${JSON.stringify({ error, code })}\n`, exitCode: code });
  });
}

test("JSON mode formats invalid option values as a single error on stderr", async (context) => {
  const command = commandHarness(context);

  const output = await command.run(["--json", "messages", "123", "--filter", "invalid"]);

  assert.match(output.stderr, /^\{"error":.*,"code":1\}\n$/);
  assert.match(output.stderr, /argument 'invalid' is invalid/);
  assert.equal(output.stdout, "");
  assert.equal(output.exitCode, 1);
});

test("JSON message failures preserve the authentication exit code", async (context) => {
  const command = commandHarness(context);

  const output = await command.run(["messages", "123", "--json"]);

  assert.deepEqual(output, {
    stdout: "",
    stderr: `${JSON.stringify({ error: "No default account. Use 'tg default <alias>' or --account flag.", code: 2 })}\n`,
    exitCode: 2,
  });
});

test("JSON errors escape multiline messages without terminal control sequences", async (context) => {
  const command = commandHarness(context, {
    getAccounts: async () => {
      throw new Error('\u001b[31mStorage "test"\nfailed\u001b[0m');
    },
  });

  const output = await command.run(["accounts", "--json"]);

  assert.deepEqual(output, {
    stdout: "",
    stderr: `${JSON.stringify({ error: 'Storage "test"\nfailed', code: 1 })}\n`,
    exitCode: 1,
  });
});

test("JSON parsing errors remove terminal control sequences from arguments", async (context) => {
  const command = commandHarness(context);

  const output = await command.run(["--json", "messages", "123", "--filter", "\u001b[31minvalid\u001b[0m"]);

  assert.match(output.stderr, /argument 'invalid' is invalid/);
  assert.doesNotMatch(output.stderr, /\\u001b/);
  assert.equal(output.stderr.includes("\u001b"), false);
  assert.equal(output.exitCode, 1);
});

const parsingCases = [
  { args: ["--json"], error: "error: missing required command" },
  { args: ["--json", "help", "missing"], error: "error: unknown command 'missing'" },
  { args: ["--json", "missing"], error: "error: unknown command 'missing'" },
  { args: ["messages", "--json"], error: "error: missing required argument 'chat'" },
  { args: ["messages", "123", "--unknown", "--json"], error: "error: unknown option '--unknown'" },
  { args: ["accounts", "rename", "old", "--json"], error: "error: missing required argument 'new'" },
  { args: ["--json", "--account"], error: "error: option '--account <alias>' argument missing" },
];

for (const { args, error } of parsingCases) {
  test(`JSON parser handles ${args.join(" ")}`, async (context) => {
    const command = commandHarness(context);

    const output = await command.run(args);

    assert.deepEqual(output, { stdout: "", stderr: `${JSON.stringify({ error, code: 1 })}\n`, exitCode: 1 });
  });
}

test("JSON mode retains successful results on stdout", async (context) => {
  const command = commandHarness(context);

  const output = await command.run(["messages", "123", "-n", "0", "--json"]);

  assert.deepEqual(output, { stdout: "[]\n", stderr: "", exitCode: 0 });
});

test("text mode retains human-readable execution errors", async (context) => {
  const command = commandHarness(context);

  const output = await command.run(["accounts", "rename", "missing", "new"]);

  assert.deepEqual(output, { stdout: "", stderr: 'Account "missing" not found\n', exitCode: 1 });
});

test("a literal --json argument after the separator does not enable JSON mode", async (context) => {
  const command = commandHarness(context);

  const output = await command.run(["default", "--", "--json"]);

  assert.deepEqual(output, { stdout: "", stderr: 'Account "--json" not found\n', exitCode: 1 });
});

test("JSON mode retains help as successful text output", async (context) => {
  const command = commandHarness(context);

  const output = await command.run(["--json", "messages", "--help"]);

  assert.match(output.stdout, /^Usage: tg messages/);
  assert.equal(output.stderr, "");
  assert.equal(output.exitCode, 0);
});

test("version output matches the installed package metadata", async (context) => {
  const metadata: unknown = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
  assert.ok(metadata !== null && typeof metadata === "object" && "version" in metadata);
  const command = commandHarness(context);

  const output = await command.run(["--json", "--version"]);

  assert.deepEqual(output, { stdout: `${metadata.version}\n`, stderr: "", exitCode: 0 });
});
