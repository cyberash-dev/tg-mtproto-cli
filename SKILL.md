---
name: tg-cli
description: >
  Read-only Telegram CLI via MTProto. Lists chats, fetches messages,
  downloads media, manages local accounts/sessions. Does not send
  messages or modify Telegram data. Use when the user asks to read
  Telegram chats, fetch messages, download media, or automate
  Telegram data extraction.
required_binaries:
  - name: tg
    package: tg-mtproto-cli
    install: npm install -g tg-mtproto-cli
    registry: https://www.npmjs.com/package/tg-mtproto-cli
    source: https://github.com/cyberash-dev/tg-mtproto-cli
  - name: jq
    optional: true
    install: brew install jq
credentials:
  - name: Telegram API credentials
    fields: [api_id, api_hash]
    obtain: https://my.telegram.org/apps
    storage: system keychain (macOS Keychain / Windows Credential Vault / Linux Secret Service)
    input: interactive prompt via `tg auth`
  - name: Phone number + OTP
    storage: not persisted
    input: interactive prompt via `tg auth` (one-time, creates session)
runtime_permissions:
  network: outbound TCP to Telegram DC servers (MTProto protocol)
  filesystem:
    - read/write: ~/.tg-mtproto-cli/sessions/*.session (SQLite auth sessions)
    - write: media files to --out dir or cwd (tg download only)
  keychain: read/write account metadata and API credentials
  shell: false
  browser: false
---

# tg — Telegram CLI via MTProto

CLI tool for reading Telegram data directly via MTProto protocol. No Bot API, no limits.

## Required binaries

| Binary | Install | Purpose |
|---|---|---|
| `tg` | `npm install -g tg-mtproto-cli` | Core CLI |
| `jq` (optional) | `brew install jq` or `apt install jq` | JSON filtering in workflow examples |

Source and provenance:
- npm: [npmjs.com/package/tg-mtproto-cli](https://www.npmjs.com/package/tg-mtproto-cli)
- GitHub: [github.com/cyberash-dev/tg-mtproto-cli](https://github.com/cyberash-dev/tg-mtproto-cli)

Verify after install:

```bash
tg --version
npm ls -g tg-mtproto-cli
```

## Required credentials

| Credential | How to obtain | Storage |
|---|---|---|
| Telegram `api_id` + `api_hash` | [my.telegram.org/apps](https://my.telegram.org/apps) | System keychain (macOS Keychain / Windows Credential Vault / Linux Secret Service) |
| Phone number + OTP code | Interactive prompt during `tg auth` | Not persisted; used once for session creation |

Credentials are entered interactively via `tg auth`. No environment variables required.

## Runtime surface

| Resource | Access | Details |
|---|---|---|
| Network | Outbound TCP to Telegram DC servers | MTProto protocol, required for all commands |
| Session files | Read/write `~/.tg-mtproto-cli/sessions/*.session` | SQLite databases with auth keys; created by `tg auth` |
| System keychain | Read/write | Stores `api_id`, `api_hash`, account metadata, default account |
| Filesystem | Write (only `tg download`) | Saves media to `--out` dir or current directory |

## Guardrails

- The CLI is **read-only by design** — it has no commands to send messages, create chats, modify groups, or perform any write operations on Telegram. The only write targets are local: session files and downloaded media.
- `tg download` writes files only to the explicitly specified `--out` directory or cwd.
- Session files contain sensitive auth material — do not read, copy, or expose `~/.tg-mtproto-cli/sessions/` contents.
- Do not log or display `api_id` / `api_hash` values.
- If `tg auth` is needed, inform the user — it requires interactive input (phone, OTP) and cannot be automated.

## Chat identification

Chats can be referenced by:
- **Username**: `@username` or `username`
- **Numeric ID**: `-1001234567890` (groups/supergroups use negative IDs)
- **Phone**: `+1234567890` (for private chats)

To find a chat's numeric ID, use `tg chats --json | jq '.[] | {id, title}'`.

## Commands reference

### List chats

```bash
tg chats [--type private|group|supergroup|channel] [--limit 50] [--offset 0]
```

### Read messages

```bash
tg messages <chat> [-n 100] [--all] [--topic <id>] [--after <datetime>]
```

| Flag | Description |
|---|---|
| `-n <count>` | Number of messages (default: 100) |
| `--all` | Entire history (shows progress) |
| `--topic <id>` | Forum topic (get IDs via `tg topics <chat>`) |
| `--after <datetime>` | Only messages after this time |

`--after` formats: `2026-02-22`, `2026-02-22T10:00`, `10:00` (today).

When `--after` + `-n` are combined: filter by date first, then take last N.

### List forum topics

```bash
tg topics <chat>
```

Returns topic IDs needed for `--topic` flag.

### Download media

```bash
tg download <chat> <messageId> [--out <dir>]
```

Downloads the media attachment from a specific message. Get message IDs from `tg messages` output (shown as `#<id>`).

### Account management

```bash
tg auth                          # authenticate (interactive)
tg logout [alias]                # remove session
tg accounts                      # list accounts
tg accounts rename <old> <new>   # rename alias
tg default <alias>               # set default
```

## Global flags

| Flag | Effect |
|---|---|
| `--account <alias>` | Use specific account instead of default |
| `--json` | JSON output (for scripting/piping) |

## JSON output

All commands support `--json` for structured output. Dates are ISO 8601.

```bash
tg chats --json
tg messages @chat -n 10 --json
tg download @chat 42 --json
```

### Message JSON schema

```json
{
  "id": 42,
  "chatId": -1001234567890,
  "senderName": "John",
  "text": "Hello",
  "date": "2026-02-22T10:15:00.000Z",
  "media": { "type": "photo", "fileName": null, "mimeType": "image/jpeg", "size": 262525 },
  "replyToId": null,
  "isOutgoing": false
}
```

`media` is `null` when no attachment. `media.type`: `photo`, `video`, `document`, `audio`, `voice`, `sticker`.

## Common workflows

### Extract text from a chat since a date

```bash
tg messages @channel --after 2026-02-01 --json | jq -r '.[].text // empty'
```

### Find messages with photos

```bash
tg messages @chat -n 500 --json | jq '[.[] | select(.media.type == "photo")]'
```

### Download all photos from recent messages

```bash
for id in $(tg messages @chat -n 50 --json | jq -r '.[] | select(.media.type == "photo") | .id'); do
  tg download @chat "$id" --out ./photos
done
```

### Read a forum topic

```bash
tg topics -1001234567890          # find topic ID
tg messages -1001234567890 --topic 42 -n 20
```

### Multi-account usage

```bash
tg chats --account work
tg messages @chat -n 10 --account personal
```

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Runtime error (invalid args, chat not found) |
| 2 | Auth required (no account, expired session) — run `tg auth` |

## Troubleshooting

- **"No default account"** → run `tg auth` or use `--account <alias>`
- **"Session expired"** → run `tg auth` to re-authenticate
- **Chat not found** → use numeric ID from `tg chats --json`
- **Empty messages** → check chat ID sign (groups are negative)
