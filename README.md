# tg-mtproto-cli

![banner](.github/profile-banner.jpg)

CLI for Telegram via MTProto. Direct access to chats, messages and media — no Bot API, no limits.

## Features

- **Multi-account** — manage multiple Telegram accounts with aliases
- **Chats** — list dialogs with unread counters
- **Messages** — fetch messages from any chat, group or supergroup
- **Forum topics** — list and read topics in supergroup forums
- **Media download** — download photos, videos, documents
- **Message search** — server-side category, text, sender and date filters within a chat
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
| `-n <count>` | Latest matching messages (default: 100); 0 returns an empty result without connecting |
| `--all` | All matches within the selected chat/topic/date bounds; overrides `-n` |
| `--topic <id>` | Messages from a specific forum topic |
| `--filter <kind>` | One of `url`, `photo`, `video`, `photo-video`, `document`, `gif`, `voice`, `audio`, `video-note`, `pinned` |
| `--query <text>` | Telegram's server-side text search |
| `--from <peer>` | Sender ID or username, resolved by Telegram |
| `--after <datetime>` | Inclusive lower bound: `date >= after` |
| `--before <datetime>` | Exclusive upper bound: `date < before` |

Combine these options with an explicit chat and global `--account`/`--json`.
Results are the latest N matches, printed oldest-to-newest. Search and history
pages contain at most 100 messages; short pages continue using Telegram's cursor.
Duplicate records are omitted. Retrieval stops at N matches, exhaustion or the
lower date bound; a non-advancing cursor fails rather than returning partial JSON.
`--all` can still load a large selected history into memory.

Both date flags accept `2026-02-22` (midnight **UTC**, unchanged),
`2026-02-22T10:00` or `"2026-02-22 10:00"` (system local time), and `10:00`
(today in system local time). ISO timestamps can include seconds, fractions (up to three digits),
`Z` or an explicit offset, such as `2026-02-22T10:00:00+03:00`. Telegram messages
have second precision; fractional bounds still select the exact interval.
Invalid dates/times, empty query/sender, malformed counts/topic IDs and
`after >= before` fail before account or network access. Counts are nonnegative
safe integers; topic IDs are positive 32-bit integers.

Put all options before `--` when using a negative numeric chat ID:

```bash
tg --json messages --filter url --topic 42 -n 20 -- -1001234567890
tg messages @username --filter photo -n 5
tg --json messages @username --query "incident" --from @alice --after 2026-02-01 --before 2026-03-01 -n 20
```

Filters use Telegram's categories and text-search semantics. `document` selects
generic files, excluding specialized audio/video categories; `gif` includes
animated MP4s. Only one category is supported (`photo-video` is a predefined
combination). There is no global search, filename/MIME/domain filter, automatic
download or link traversal. GIF/video-note JSON metadata uses `animation` and
`video_note`. Search results keep the existing message shape and preserved link data.
With `--json`, argument and command failures emit one JSON object on stderr:
`{"error":"message","code":1}`. The numeric `code` matches the process exit code,
including existing authentication failures that exit 2. Errors contain no terminal
color codes. Successful message JSON still contains only the result array.

Capture results and errors separately in scripts (this invalid filter needs no account or network):

```bash
tg --json messages @example --filter invalid >messages.json 2>error.json
tg_exit_code=$?
jq . error.json
```

Hidden links appear as `label (URL)` in terminal output. JSON preserves the original
`text` and includes a `links` array for visible URLs and hidden destinations, including
media captions. Malformed link ranges are skipped with a text warning on stderr,
including in JSON mode; messages and valid links remain in the result.
Extract destinations from the latest 20 link-bearing messages with:

```bash
tg messages @username --filter url -n 20 --json | jq -r '.[].links[].url'
```

## Forum context

Chat JSON includes `isForum`; the chat table has a `Forum` column. Group/channel
classification uses Telegram's chat subtype. Gigagroups and monoforums use the
existing `supergroup` category; monoforum topic semantics are not supported.

Message JSON includes `topicId`, separate from `replyToId`. Readable output adds
`[topic:42]` when the topic is known. In a confirmed supergroup forum, ordinary
General messages and replies have `topicId: 1`; other topics use the topic root
ID, including nested replies. Topic-creation service messages use their own ID.
Other service messages need an explicit topic header. Cross-chat quotes with a
foreign `replyToPeerId` keep the local `replyToTopId`, or General (1) when absent;
the foreign `replyToMsgId` is never used as a local topic ID. Non-forum messages,
hidden quote sources without a peer, story/scheduled replies and inconclusive
headers have `topicId: null`. Missing forum flags are not inferred; a missing peer
record still surfaces the provider error. No extra history or topic requests
are made while mapping messages.

Get topic names separately, using the same chat:

```bash
tg --json topics --limit 100 -- -1001234567890
tg --json messages --topic 42 -n 20 -- -1001234567890
```

Join `message.topicId` to `topic.id` within the requested `message.chatId`.
Topic IDs are not globally unique. The topic-list limit defaults to 100; increase
it explicitly, for example `--limit 200`, if the needed name is missing. Renamed
topics keep their ID, closed topics remain readable, and a deleted/inaccessible
or unlisted title does not invalidate a known message topic ID. No topic names
are fabricated or looked up per message.

## Global flags

| Flag | Description |
|---|---|
| `--account <alias>` | Use a specific account |
| `--json` | Output in JSON format |
| `--version` | Show the installed package version from `package.json` |

`--help` and `--version` print text even with `--json`. Interactive authentication
prompts and account-management success messages also remain text. The package
version identifies a release; it does not identify local Git changes.

## How it works

Uses [mtcute](https://github.com/mtcute/mtcute) for MTProto protocol.
Sessions are stored in `~/.tg-mtproto-cli/sessions/`.
Credentials are stored in the system keychain via [cross-keychain](https://github.com/nicolo-ribaudo/cross-keychain).

## License

MIT
