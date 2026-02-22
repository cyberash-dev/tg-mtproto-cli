# Media

Представляет медиа-вложение сообщения.

## Поля

| Поле | Тип | Описание |
|---|---|---|
| type | MediaType | Тип медиа |
| fileName | string \| null | Имя файла (для document, audio; null для photo/sticker) |
| mimeType | string \| null | MIME-тип файла |
| size | number \| null | Размер файла в байтах (null если неизвестен) |

## MediaType

| Значение | Описание |
|---|---|
| `photo` | Фотография |
| `video` | Видео |
| `document` | Документ / файл |
| `audio` | Аудиофайл |
| `voice` | Голосовое сообщение |
| `video_note` | Видеосообщение (кружок) |
| `sticker` | Стикер |
| `animation` | GIF-анимация |

## Отображение в CLI

При выводе сообщения с медиа без текста отображается плейсхолдер:

```
[Photo]
[Video: video.mp4, 12.3 MB]
[Document: report.pdf, 1.5 MB]
[Voice: 0:23]
[Sticker: 😀]
```
