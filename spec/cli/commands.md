# CLI Commands

Интерфейс командной строки реализован через `commander`. Точка входа — команда `tg`.

## Глобальные флаги

| Флаг | Тип | Описание |
|---|---|---|
| `--account <alias>` | string | Использовать указанный аккаунт (по alias) вместо default |
| `--json` | boolean | Вывод в формате JSON вместо human-readable таблиц |
| `--help` | boolean | Показать справку |
| `--version` | boolean | Показать версию |

## Команды

| Команда | Описание | Подробности |
|---|---|---|
| `tg auth` | Авторизация аккаунта | [auth.md](../use-cases/auth.md) |
| `tg logout [alias]` | Разлогин аккаунта | [logout.md](../use-cases/logout.md) |
| `tg accounts` | Список аккаунтов | [accounts-list.md](../use-cases/accounts-list.md) |
| `tg accounts rename <old> <new>` | Переименовать alias аккаунта | [accounts-list.md](../use-cases/accounts-list.md) |
| `tg default <alias>` | Установить default-аккаунт | [set-default-account.md](../use-cases/set-default-account.md) |
| `tg chats` | Список чатов | [chats-list.md](../use-cases/chats-list.md) |
| `tg messages <chat>` | Сообщения и серверный поиск в чате | [messages-list.md](../use-cases/messages-list.md) |
| `tg topics <chat>` | Список forum-топиков в супергруппе | [topics-list.md](../use-cases/topics-list.md) |
| `tg download <chat> <msg_id>` | Скачать медиа | [download-media.md](../use-cases/download-media.md) |

## Формат вывода

### Human-readable (по умолчанию)

- Таблицы: `cli-table3` с выравниванием по столбцам, цветом через `chalk`.
- Списки сообщений: свободный текстовый формат с датами и именами.
- Прогресс: `cli-progress` для скачивания медиа.
- Ошибки: красным цветом (`chalk.red`) в stderr.
- Информационные сообщения: обычным цветом в stdout.

### JSON (`--json`)

- Все данные выводятся в stdout как валидный JSON.
- Спецификация предполагала JSON-ошибки в stderr: `{"error": "message", "code": 1}`.
  Фактический `messages` сохраняет текстовые ошибки в stderr, включая режим `--json`;
  изменение формата ошибок не входит в добавление поиска.
- Прогресс при `--json` не выводится.
- Даты в формате ISO 8601 (`2026-02-22T10:15:00Z`).

## Exit Codes

| Код | Значение |
|---|---|
| 0 | Успешное выполнение |
| 1 | Ошибка выполнения (невалидные аргументы, чат не найден, и т.д.) |
| 2 | Требуется аутентификация (нет аккаунтов, сессия истекла) |

## Примеры использования

```bash
tg auth

tg accounts

tg accounts rename ivan work

tg default work

tg chats --type private --limit 20

tg chats --json | jq '.[].title'

tg messages @username -n 50

tg messages --all -- -1001234567890

tg topics -1001234567890

tg --json messages --filter url --topic 42 -n 50 -- -1001234567890

tg messages @username --filter photo -n 5

tg messages @username --query "incident" --from @alice --after 2026-02-01 --before 2026-03-01 -n 20

tg download @username 42 --out ~/Downloads

tg logout work

tg chats --account personal
```

## Параметры сообщений

`--filter` принимает одну категорию: `url`, `photo`, `video`, `photo-video`,
`document`, `gif`, `voice`, `audio`, `video-note`, `pinned`. `--query` задаёт
серверный поиск текста, `--from` задаёт отправителя (ID или username).
Все параметры сочетаются с обязательным чатом, `--topic`, `--account` и `--json`.
Глобальный поиск, загрузка вложений, обход ссылок и фильтры MIME/имени файла/домена
не добавляются.

`-n` ограничивает число последних совпадений (по умолчанию 100), вывод идёт от
старых к новым. `-n 0` без `--all` не подключается к Telegram. `--all` имеет
приоритет над количеством и загружает все совпадения в заданных границах.
Число сообщений должно быть неотрицательным safe integer, ID топика положительным int32.

`--after` включителен, `--before` исключителен. Дата `YYYY-MM-DD` означает полночь
UTC, дата со временем без зоны и `HH:mm` используют локальную зону системы.
Поддерживаются секунды, доли секунды (до трёх цифр) и явные ISO-смещения. Некорректные даты,
пустые query/from и равные/обратные границы отклоняются до доступа к аккаунту.
Для отрицательного ID все опции должны идти до `--`, а ID после него.
