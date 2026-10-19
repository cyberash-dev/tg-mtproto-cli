# Chat

Представляет чат в Telegram.

## Поля

| Поле | Тип | Описание |
|---|---|---|
| id | number | Уникальный идентификатор чата |
| type | ChatType | Тип чата |
| isForum | boolean | В метаданных группы включён режим форума; false, если флаг отсутствует |
| title | string | Название чата или имя собеседника для приватных чатов |
| username | string \| null | Username чата/канала без `@` |
| unreadCount | number | Количество непрочитанных сообщений |
| lastMessage | string \| null | Текст-превью последнего сообщения (обрезается до 100 символов) |
| lastActivity | Date | Дата последней активности в чате |

## ChatType

| Значение | Описание |
|---|---|
| `private` | Личная переписка |
| `group` | Обычная группа |
| `supergroup` | Супергруппа |
| `channel` | Канал |

Пользователи и боты отображаются как `private`; для mtcute Chat используется
`chatType`, а не общий `type = "chat"`. Варианты `gigagroup` и `monoforum`
отображаются как `supergroup`, без расширения доменного перечня типов.
Для `monoforum` это намеренная нормализация: Telegram описывает личные сообщения
каналу как [специальную супергруппу](https://core.telegram.org/api/monoforum).
Её диалоги разделяются по `saved_peer_id`, а не по forum-thread ID.
Это не добавляет поддержку топиков monoforum. В таблице `Forum` выводит `yes`/`no`,
JSON всегда содержит boolean `isForum`.
