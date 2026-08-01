# Wedding invitation — Дмитрий и София

Статический фронтенд для GitHub Pages, подключённый к собственному API:

- сайт: `https://dmitrii-sofia-wedding.ru`;
- API: `https://api.dmitrii-sofia-wedding.ru`;
- админка: `https://dmitrii-sofia-wedding.ru/admin.html`.

## Публикация

Скопируйте содержимое этой папки в корень GitHub-репозитория и выполните:

```bash
git add .
git commit -m "Connect wedding frontend to private API"
git push origin main
```

## Персональная ссылка

```text
https://dmitrii-sofia-wedding.ru/?invite=SLUG_ИЗ_БАЗЫ
```

Имена гостей не хранятся во фронтенде и загружаются через `POST /api/invitation`.

## Админка

Админка использует серверные endpoints:

- `POST /api/admin/login`;
- `GET /api/admin/session`;
- `GET /api/admin/responses`;
- `POST /api/admin/logout`.

JWT хранится в защищённой `HttpOnly` cookie. В `config.js` не должны находиться пароль, email администратора, JWT-секрет или пароль базы данных.

## Требования к API

API должен разрешать CORS для:

- `https://dmitrii-sofia-wedding.ru`;
- `https://www.dmitrii-sofia-wedding.ru`.

Для административных запросов необходимы `Access-Control-Allow-Credentials: true` и cookie с параметрами `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
