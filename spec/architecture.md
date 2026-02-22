# tg-mtproto-cli

Это CLI для работы с телеграм. В своей основе использует mtcute.
Предоставляет простой способ использования телеграма из командной строки.
Организует надежное хранение кредов в системном хранилище через cross-keychain.
Реализовано на TypeScript.
Реализовано по Clean Architecture.

## Слои архитектуры

```mermaid
block-beta
  columns 1
  block:cli["CLI (Presentation)\ncommander, форматирование вывода, prompts"]
  end
  block:usecases["Use Cases (Application)\nAuthUseCase, LogoutUseCase, GetChatsUseCase"]
  end
  block:domain["Domain (Entities)\nAccount, Chat, Message, Media\nПорты: TelegramGateway, CredentialStorage, SessionStorage"]
  end
  block:infra["Infrastructure (Adapters)\nMtcuteTelegramGateway, KeychainCredentialStore, SqliteSessionStorage"]
  end

  cli --> usecases
  usecases --> domain
  infra --> domain
```

### Правила зависимостей

- Domain не зависит ни от чего.
- Use Cases зависят только от Domain (сущности + порты).
- CLI зависит от Use Cases, может знать о Domain-сущностях для форматирования вывода.
- Infrastructure реализует порты из Domain, зависит от Domain.
- Внешние слои зависят от внутренних, но не наоборот.
- Все зависимости инжектируются через конструкторы (dependency injection без фреймворка). Композиция происходит в точке входа (`src/main.ts`).

## Структура директорий

```
src/
├── main.ts                           # Точка входа, композиция зависимостей
├── domain/
│   ├── entities/
│   │   ├── account.ts
│   │   ├── chat.ts
│   │   ├── message.ts
│   │   └── media.ts
│   └── ports/
│       ├── telegram-gateway.ts
│       ├── credential-storage.ts
│       └── session-storage.ts
├── use-cases/
│   ├── auth.ts
│   ├── logout.ts
│   ├── accounts-list.ts
│   ├── set-default-account.ts
│   ├── chats-list.ts
│   ├── messages-list.ts
│   └── download-media.ts
├── infrastructure/
│   ├── mtcute-telegram-gateway.ts
│   ├── keychain-credential-storage.ts
│   └── sqlite-session-storage.ts
└── cli/
    ├── app.ts                        # Конфигурация commander
    ├── commands/
    │   ├── auth.ts
    │   ├── logout.ts
    │   ├── accounts.ts
    │   ├── chats.ts
    │   ├── messages.ts
    │   └── download.ts
    └── formatters/
        ├── account-formatter.ts
        ├── chat-formatter.ts
        └── message-formatter.ts
```

## Ключевые зависимости

| Пакет | Назначение |
|---|---|
| `@mtcute/node` | MTProto-клиент для Telegram (включает SqliteStorage) |
| `cross-keychain` | Хранение кредов в системном хранилище (macOS Keychain, Windows Credential Manager, Linux Secret Service) |
| `commander` | Парсинг CLI-команд и флагов |
| `chalk` | Цветной вывод в терминал |
| `cli-table3` | Форматирование таблиц в терминал |
| `cli-progress` | Прогресс-бар для скачивания медиа |

## Принципы

- **Порты и адаптеры**: Domain определяет интерфейсы (порты), Infrastructure их реализует (адаптеры). Use Cases работают через порты.
- **Dependency Injection**: Зависимости создаются в `main.ts` и передаются через конструкторы. Никакого DI-фреймворка.
- **Единственная ответственность**: Каждый use case — один файл, одна публичная функция `execute`.
- **Immutable entities**: Доменные сущности — readonly типы, без методов мутации.
