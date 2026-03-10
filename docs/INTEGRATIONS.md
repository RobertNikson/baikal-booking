# Partner external booking sync (anti-duplicates)

Use this endpoint when partner receives direct bookings (phone/CRM) to block slots in mini app.

## Endpoint

`POST /partners/:partnerId/webhooks/:integrationId`

Headers:
- `content-type: application/json`
- `x-integration-token: <credentials_ref>` (optional but recommended)

Body format (preferred):
```json
{
  "source": "amo_crm",
  "busySlots": [
    {
      "unitId": "14677def-58c3-4d8e-bc35-7b6573c543e2",
      "startsAt": "2026-03-12T10:00:00.000Z",
      "endsAt": "2026-03-12T12:00:00.000Z",
      "externalRef": "amo-12345"
    }
  ]
}
```

Alternative key `items` is also supported.

## Result

- Busy slots are written into `availability_slots` as:
  - `is_available=false`
  - `source='sync'`
- This prevents duplicate booking in mini app on same time interval.

## n8n quick mapping

1. Trigger: CRM webhook/new booking
2. Function node maps to:
```js
return [{
  json: {
    source: 'crm',
    busySlots: [
      {
        unitId: $json.unit_id,
        startsAt: $json.starts_at,
        endsAt: $json.ends_at,
        externalRef: $json.id
      }
    ]
  }
}]
```
3. HTTP Request node:
- Method: POST
- URL: `https://rscczdcmlr.tail3f3f1d.ts.net/baikal-api/partners/<partnerId>/webhooks/<integrationId>`
- Header: `x-integration-token: <token>`
- Body: JSON (from previous node)

