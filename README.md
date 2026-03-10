# Baikal Booking MVP

MVP backend for Telegram Mini App:
- location-first catalog (Baikal -> location -> category)
- Telegram WebApp auth (`/auth/telegram`)
- partner registration (ИП/ООО/самозанятый)
- partner integrations (api/csv/ical)
- listings, units, availability
- hold/confirm/cancel booking flow
- payments (`mock` + optional YooKassa)

## Run

1. Start PostgreSQL:
```bash
docker compose up -d
```

2. Create `.env`:
```bash
cp .env.example .env
```

3. Apply schema + seed:
```bash
psql postgresql://baikal:baikal@127.0.0.1:5434/baikal_booking -f db/schema.sql
psql postgresql://baikal:baikal@127.0.0.1:5434/baikal_booking -f db/seed.sql
```

4. Start API:
```bash
npm run dev
```

5. Open UI:
- User mini UI: `http://127.0.0.1:3200/`
- Partner cabinet: `http://127.0.0.1:3200/partner.html`

## Main endpoints

- `GET /health`
- `POST /auth/telegram`
- `GET /locations?parentId=<uuid>`
- `GET /catalog?locationId=<uuid>&category=stay|equipment|activity`
- `POST /partners/register`
- `GET /partners/:partnerId/dashboard`
- `POST /partners/:partnerId/integrations`
- `POST /partners/:partnerId/listings`
- `POST /availability/upsert`
- `POST /bookings/hold`
- `POST /bookings/:id/pay` (`auto|mock|yookassa`)
- `POST /payments/mock/:bookingId/success`
- `POST /bookings/:id/confirm`
- `POST /bookings/:id/cancel`
- `POST /system/expire-holds`

## Production stack (PostgreSQL + Redis + MinIO + Backups)

Prepared files:
- `docker-compose.prod.yml`
- `.env.prod.example`

Run:
```bash
cp .env.prod.example .env.prod
# edit secrets in .env.prod

docker compose -f docker-compose.prod.yml up -d
```

Apply schema/seed in prod DB:
```bash
docker exec -i baikal-prod-postgres psql -U baikal -d baikal_booking < db/schema.sql
docker exec -i baikal-prod-postgres psql -U baikal -d baikal_booking < db/seed.sql
```

Services:
- App: `http://127.0.0.1:3200`
- Postgres: `127.0.0.1:5434`
- Redis: `127.0.0.1:6379`
- MinIO API: `http://127.0.0.1:9000`
- MinIO Console: `http://127.0.0.1:9001`

## Next steps
- wire real S3 media upload flow from partner cabinet
- switch mock payment to YooKassa
- add auth/RBAC for partner cabinet
