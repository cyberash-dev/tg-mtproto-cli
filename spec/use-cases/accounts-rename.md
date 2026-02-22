# Accounts Rename

Переименовывает alias существующего аккаунта.

## Команда CLI

```bash
tg accounts rename <old> <new>
```

## Входные параметры

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| old | string (аргумент) | Да | Текущий alias аккаунта |
| new | string (аргумент) | Да | Новый alias |

## Выходные данные

```
Account alias renamed: "work" -> "job"
```

## Основной сценарий

1. Найти аккаунт по `old` alias в CredentialStorage.
2. Проверить, что `new` alias свободен.
3. Вызвать CredentialStorage.renameAlias(old, new).
4. Вывести подтверждение.

## Ошибки

| Ситуация | Сообщение | Exit code |
|---|---|---|
| Не переданы аргументы | `Usage: tg accounts rename <old> <new>` | 1 |
| Аккаунт не найден | `Account "xxx" not found` | 1 |
| Новый alias уже занят | `Alias "yyy" is already taken` | 1 |
| Невалидный формат alias | `Invalid alias format. Use: letters, digits, hyphens, underscores` | 1 |
| Нет залогиненных аккаунтов | `No accounts found. Use 'tg auth' to log in.` | 2 |

## Граничные случаи

- Старый и новый alias совпадают: вывести `Alias is already "work"` с exit code 0.
