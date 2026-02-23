# tg-mtproto-cli

![banner](.github/profile-banner.jpg)

CLI for Telegram via MTProto. Direct access to chats, messages and media — no Bot API, no limits.

## Features

- **Multi-account** — manage multiple Telegram accounts with aliases
- **Chats** — list dialogs with unread counters
- **Messages** — fetch messages from any chat, group or supergroup
- **Forum topics** — list and read topics in supergroup forums
- **Media download** — download photos, videos, documents
- **Time filter** — `--after` to show messages since a specific time
- **JSON output** — `--json` flag for scripting and piping
- **Secure storage** — credentials in system keychain (macOS Keychain, Windows Credential Vault, Linux Secret Service)

## Prerequisites

You need Telegram API credentials (`api_id` and `api_hash`).
Get them at [my.telegram.org](https://my.telegram.org/apps).

## Install

```bash
npm install -g tg-mtproto-cli
```

## Quick start

```bash
# Authenticate (will prompt for API credentials on first run)
tg auth

# List your chats
tg chats

# Last 20 messages from a chat
tg messages @username -n 20

# Messages since 9am today
tg messages @username --after 09:00

# Download a photo
tg download @username 42
```

## Commands

| Command | Description |
|---|---|
| `tg auth` | Authenticate a Telegram account |
| `tg logout <alias>` | Log out and remove session |
| `tg accounts` | List all accounts |
| `tg accounts rename <old> <new>` | Rename an account alias |
| `tg default <alias>` | Set the default account |
| `tg chats` | List chats |
| `tg messages <chat>` | List messages from a chat |
| `tg topics <chat>` | List forum topics in a supergroup |
| `tg download <chat> <messageId>` | Download media from a message |

## Messages options

```bash
tg messages <chat> [options]
```

| Option | Description |
|---|---|
| `-n <count>` | Number of messages (default: 100) |
| `--all` | Load entire chat history |
| `--topic <id>` | Messages from a specific forum topic |
| `--after <datetime>` | Messages after a given time |

`--after` accepts: `2026-02-22`, `2026-02-22T10:00`, `10:00` (today).

## Global flags

| Flag | Description |
|---|---|
| `--account <alias>` | Use a specific account |
| `--json` | Output in JSON format |

## How it works

Uses [mtcute](https://github.com/mtcute/mtcute) for MTProto protocol.
Sessions are stored in `~/.tg-mtproto-cli/sessions/`.
Credentials are stored in the system keychain via [cross-keychain](https://github.com/nicolo-ribaudo/cross-keychain).

## License

MIT
