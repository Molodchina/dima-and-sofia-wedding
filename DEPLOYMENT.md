# Развёртывание финальной версии

## 1. Фронтенд

Разместите все файлы из этой папки в корне GitHub Pages-репозитория.

`config.js` уже содержит:

```js
apiBase: "https://api.dmitrii-sofia-wedding.ru"
```

Персональные ссылки имеют вид:

```text
https://dmitrii-sofia-wedding.ru/?invite=SLUG_ИЗ_БАЗЫ
```

Админка:

```text
https://dmitrii-sofia-wedding.ru/admin.html
```

## 2. Обязательные API endpoints

Публичные:

- `POST /api/invitation` — тело `{ "slug": "..." }`;
- `POST /api/rsvp` — тело `{ "slug", "attendanceStatus", "contact", "comment", "consent" }`.

Административные:

- `POST /api/admin/login`;
- `GET /api/admin/session`;
- `GET /api/admin/invitations`;
- `POST /api/admin/invitations`;
- `PUT /api/admin/invitations/:slug`;
- `PATCH /api/admin/invitations/:slug/active`;
- `DELETE /api/admin/invitations/:slug`;
- `GET /api/admin/responses`;
- `POST /api/admin/logout`.

Тело создания/редактирования приглашения:

```json
{
  "slug": "anna-mikhail-a1b2c3d4e5f6",
  "greeting": "Дорогие Анна и Михаил!",
  "guests": ["Анна", "Михаил"],
  "maxGuests": 2,
  "isActive": true
}
```

Если база уже была создана со старым ограничением на 4 гостей, перед использованием новых приглашений выполните на PostgreSQL:

```sql
alter table guest_invitations
  drop constraint if exists guest_invitations_max_guests_check;

alter table guest_invitations
  add constraint guest_invitations_max_guests_check
  check (max_guests between 1 and 20);
```

## 3. CORS

API должен разрешать только:

```text
https://dmitrii-sofia-wedding.ru
https://www.dmitrii-sofia-wedding.ru
```

Для административных запросов обязательно:

```text
Access-Control-Allow-Credentials: true
```

Нельзя использовать `Access-Control-Allow-Origin: *` вместе с cookie.

## 4. Cookie администратора

Рекомендуемые параметры:

```text
HttpOnly
Secure
SameSite=Lax
Path=/
```

Для cookie `__Host-wedding_admin` нельзя задавать `Domain`.

## 5. Проверка

Проверка приглашения:

```bash
curl -X POST \
  https://api.dmitrii-sofia-wedding.ru/api/invitation \
  -H 'Content-Type: application/json' \
  -d '{"slug":"anna-mikhail-j3p8n2x7"}'
```

Проверка сайта:

```text
https://dmitrii-sofia-wedding.ru/?invite=anna-mikhail-j3p8n2x7
```

Проверка админки:

```text
https://dmitrii-sofia-wedding.ru/admin.html
```

Без действующей cookie запрос `GET /api/admin/responses` должен возвращать `401`.
