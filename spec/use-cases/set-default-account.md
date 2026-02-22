# Set Default Account

Устанавливает указанный аккаунт как аккаунт по умолчанию.

## Команда CLI

```bash
tg default <alias>
```

## Входные параметры

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| alias | string (аргумент) | Да | Alias аккаунта |

## Выходные данные

```
Default account set to "work" (+79001234567, Иван Иванов)
```

## Основной сценарий

1. Найти аккаунт по `alias` в CredentialStorage.
2. Снять флаг `isDefault` с текущего default-аккаунта (если есть).
3. Установить `isDefault = true` на целевом аккаунте.
4. Сохранить изменения в CredentialStorage.
5. Вывести подтверждение.

## Ошибки

| Ситуация | Сообщение | Exit code |
|---|---|---|
| Не передан alias | `Usage: tg default <alias>` | 1 |
| Аккаунт не найден | `Account "xxx" not found` | 1 |
| Нет залогиненных аккаунтов | `No accounts found. Use 'tg auth' to log in.` | 2 |

## Граничные случаи

- Указанный аккаунт уже является default: вывести `Account "work" is already the default` с exit code 0.
