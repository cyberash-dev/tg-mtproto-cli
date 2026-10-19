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
tg messages <chat> [-n 100] [--all] [--topic <id>] [--filter <kind>] [--query <text>] [--from <peer>] [--after <datetime>] [--before <datetime>]
```

| Flag | Description |
|---|---|
| `-n <count>` | Latest N matches (default: 100); 0 returns `[]` in JSON without connecting |
| `--all` | All matches in the selected chat/topic/date range; overrides `-n` |
| `--topic <id>` | Forum topic (get IDs via `tg topics <chat>`) |
| `--filter <kind>` | `url`, `photo`, `video`, `photo-video`, `document`, `gif`, `voice`, `audio`, `video-note`, `pinned` |
| `--query <text>` | Server-side text search |
| `--from <peer>` | Sender numeric ID or username |
| `--after <datetime>` | Include messages at or after this time |
| `--before <datetime>` | Exclude messages at or after this time |

A chat is mandatory. All options combine; N counts matches after all filters,
printed oldest-to-newest. Pages are bounded to 100 and stop at N, exhaustion or
the lower date bound; duplicates are skipped and a repeated cursor is an error.
`--all` is intentionally unbounded within the chosen scope and stores results in memory.

Both date flags accept `2026-02-22` (midnight UTC, unchanged),
`2026-02-22T10:00` / `"2026-02-22 10:00"` (local time), and `10:00` (today, local
time). ISO seconds/fractions (up to three digits) and `Z` / `+03:00` offsets are supported. Message
timestamps have second precision. Invalid dates/times, equal/reversed bounds,
empty query/sender and malformed counts/topic IDs fail before network access.
Counts must be nonnegative safe integers, topic IDs positive 32-bit integers.
For negative chat IDs, put options before `--`, then the ID:

```bash
tg --json messages --filter url --topic 42 -n 20 -- -1001234567890
```

Telegram defines matching semantics. `document` is generic files, `gif` includes
animated MP4s. One category per search; `photo-video` is a predefined combination.
No global search, arbitrary category combinations, filename/MIME/domain filters,
automatic downloads or link traversal. Search only returns attachment metadata.

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
| `--version` | Installed package version from `package.json` (not a Git revision) |

## JSON output

Listings and downloads support `--json` for structured results. Dates are ISO 8601.
Argument and command failures emit one JSON object on stderr, for example
`{"error":"message","code":1}`. The numeric code matches the existing process exit
code (1 or 2), and error text contains no terminal color codes. Capture stderr
separately from successful JSON stdout; progress is disabled in JSON mode.
Explicit help/version, interactive authentication prompts, and account-management
success messages remain text.

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
  "links": [],
  "date": "2026-02-22T10:15:00.000Z",
  "media": { "type": "photo", "fileName": null, "mimeType": "image/jpeg", "size": 262525 },
  "replyToId": null,
  "isOutgoing": false
}
```

`media` is `null` when no attachment. `media.type`: `photo`, `video`, `document`, `audio`, `voice`, `sticker`, `animation`, `video_note`.

`text` stays unchanged. `links` contains visible (`url`) and hidden (`text_link`)
URL entities from text or captions, or `[]` when none are present. Each entry has
`kind`, UTF-16 `offset` and `length`, the label `text`, and the exact `url` target.
Repeated occurrences are retained. Other formatting entities are omitted.
Invalid link ranges fail with `Invalid link entity range in message #<id>: offset=<offset>, length=<length>`.
Terminal output adds hidden destinations in parentheses unless the label already
equals the URL; control characters in appended destinations are escaped.
Displaying a destination does not open it.

## Common workflows

### Extract visible and hidden link destinations

```bash
tg messages @chat --filter url -n 20 --json | jq -r '.[].links[].url'
```

### Extract text from a chat since a date

```bash
tg messages @channel --after 2026-02-01 --json | jq -r '.[].text // empty'
```

### Find messages with photos

```bash
tg messages @chat --filter photo -n 20 --json
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
tg messages --topic 42 -n 20 -- -1001234567890
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
