import express from 'express';
import dotenv from 'dotenv';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { query, pool } from './db.js';
import { verifyTelegramInitData, upsertUserFromInitData } from './telegramAuth.js';
import { createPaymentForBooking, markPaymentPaidByBooking } from './payments.js';

dotenv.config();

const app = express();
app.use(express.json({ limit: '3mb' }));
app.use(express.static('public'));
const uploadsDir = path.resolve('public/uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
const HOLD_MINUTES = Number(process.env.HOLD_MINUTES || 15);

async function sendTelegramNotify(text) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
  if (!botToken || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch {}
}

function signToken(payload) {
  const secret = process.env.JWT_SECRET || 'change_me_jwt_secret';
  return jwt.sign(payload, secret, { expiresIn: '14d' });
}

function authFromToken(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try {
    const secret = process.env.JWT_SECRET || 'change_me_jwt_secret';
    return jwt.verify(m[1], secret);
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const user = authFromToken(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.auth = user;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    const user = authFromToken(req);
    if (user && roles.includes(user.role)) {
      req.auth = user;
      return next();
    }

    const key = process.env.ADMIN_API_KEY;
    const provided = req.headers['x-admin-key'];
    if (key && provided && provided === key && roles.includes('admin')) {
      req.auth = { role: 'admin' };
      return next();
    }

    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    return res.status(403).json({ error: 'Forbidden' });
  };
}

function requireAdmin(req, res, next) {
  const user = authFromToken(req);
  if (user?.role === 'admin') {
    req.auth = user;
    return next();
  }
  const key = process.env.ADMIN_API_KEY;
  if (!key) return res.status(503).json({ error: 'ADMIN_API_KEY is not set' });
  const provided = req.headers['x-admin-key'];
  if (!provided || provided !== key) return res.status(403).json({ error: 'Forbidden' });
  req.auth = { role: 'admin' };
  next();
}

function ensurePartnerAccess(req, res, next) {
  if (req.auth?.role === 'admin') return next();
  if (!req.auth?.partnerId || req.auth.partnerId !== req.params.partnerId) {
    return res.status(403).json({ error: 'Partner scope denied' });
  }
  next();
}

const rateWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const rateMax = Number(process.env.RATE_LIMIT_MAX || 120);
const rateMap = new Map();
app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  const key = `${ip}:${req.path}`;
  const now = Date.now();
  const entry = rateMap.get(key) || { count: 0, resetAt: now + rateWindowMs };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + rateWindowMs;
  }
  entry.count += 1;
  rateMap.set(key, entry);
  if (entry.count > rateMax) return res.status(429).json({ error: 'Too many requests' });
  next();
});

app.get('/health', async (_, res) => {
  await query('select 1');
  res.json({ ok: true });
});

app.post('/auth/token', async (req, res) => {
  const p = z.object({
    userId: z.string().uuid().optional(),
    partnerId: z.string().uuid().optional(),
    role: z.enum(['user', 'partner', 'admin']),
    adminKey: z.string().optional(),
  }).safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());

  if (p.data.role === 'admin') {
    if (!process.env.ADMIN_API_KEY || p.data.adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(403).json({ error: 'Bad admin key' });
    }
  }
  const token = signToken({ userId: p.data.userId || null, partnerId: p.data.partnerId || null, role: p.data.role });
  res.json({ token });
});

app.post('/media/upload-base64', requireRole('partner','admin'), async (req, res) => {
  const p = z.object({
    filename: z.string().min(1),
    contentType: z.string().startsWith('image/'),
    dataBase64: z.string().min(10),
  }).safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());

  const safeName = `${Date.now()}-${p.data.filename}`.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fp = path.join(uploadsDir, safeName);
  const buf = Buffer.from(p.data.dataBase64, 'base64');
  fs.writeFileSync(fp, buf);
  res.status(201).json({ url: `/uploads/${safeName}` });
});

app.post('/analytics/event', async (req, res) => {
  const p = z.object({
    eventType: z.enum(['listing_view','book_click','booking_hold','booking_confirm']),
    userId: z.string().uuid().optional(),
    listingId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
    payload: z.record(z.any()).optional(),
  }).safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());

  const r = (await query(
    `insert into analytics_events(event_type,user_id,listing_id,location_id,payload)
     values($1,$2,$3,$4,$5) returning *`,
    [p.data.eventType, p.data.userId || null, p.data.listingId || null, p.data.locationId || null, p.data.payload || {}]
  )).rows[0];
  res.status(201).json(r);
});

app.get('/admin/analytics/by-location', requireAdmin, async (req, res) => {
  const p = z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }).safeParse(req.query);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const rows = (await query(
    `select coalesce(l.name,'unknown') as location, count(*)::int as events
     from analytics_events ae
     left join locations l on l.id=ae.location_id
     where ae.created_at >= now() - ($1::text || ' days')::interval
     group by coalesce(l.name,'unknown')
     order by events desc`,
    [String(p.data.days)]
  )).rows;
  res.json(rows);
});

app.get('/admin/analytics/funnel', requireAdmin, async (req, res) => {
  const p = z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }).safeParse(req.query);
  if (!p.success) return res.status(400).json(p.error.flatten());

  const days = p.data.days;
  const q = `
    with base as (
      select event_type, count(*)::int as c
      from analytics_events
      where created_at >= now() - ($1::text || ' days')::interval
      group by event_type
    )
    select
      coalesce((select c from base where event_type='listing_view'),0) as listing_view,
      coalesce((select c from base where event_type='book_click'),0) as book_click,
      coalesce((select c from base where event_type='booking_hold'),0) as booking_hold,
      coalesce((select c from base where event_type='booking_confirm'),0) as booking_confirm
  `;
  const row = (await query(q, [String(days)])).rows[0];
  const conv = {
    click_from_view: row.listing_view ? Number((row.book_click / row.listing_view * 100).toFixed(1)) : 0,
    hold_from_click: row.book_click ? Number((row.booking_hold / row.book_click * 100).toFixed(1)) : 0,
    confirm_from_hold: row.booking_hold ? Number((row.booking_confirm / row.booking_hold * 100).toFixed(1)) : 0,
  };

  res.json({ days, counts: row, conversion: conv });
});

app.post('/auth/telegram', async (req, res) => {
  const p = z.object({ initData: z.string().min(10) }).safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN is not set' });

  const valid = verifyTelegramInitData(p.data.initData, botToken);
  if (!valid) return res.status(401).json({ error: 'Invalid Telegram initData' });

  const user = await upsertUserFromInitData(p.data.initData);
  const token = signToken({ userId: user.id, role: user.role || 'user' });
  res.json({ user, token });
});

app.post('/ai/chat', async (req, res) => {
  const p = z.object({ message: z.string().min(1).max(2000) }).safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'DEEPSEEK_API_KEY is not set' });
  }

  try {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content:
              'Ты AI-помощник сервиса бронирования на Байкале. Отвечай кратко, дружелюбно, полезно. Учитывай локации: Листвянка, Ольхон, МРС, Малое море, Бухта Песчаная.',
          },
          { role: 'user', content: p.data.message },
        ],
        temperature: 0.5,
      }),
    });

    const json = await resp.json();
    if (!resp.ok) return res.status(resp.status).json({ error: json?.error?.message || 'DeepSeek API error' });

    const answer = json?.choices?.[0]?.message?.content?.trim() || 'Не удалось получить ответ.';
    res.json({ answer });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/locations', async (req, res) => {
  const { parentId } = req.query;
  const sql = parentId
    ? `select * from locations where is_active=true and parent_id=$1 order by name`
    : `select * from locations where is_active=true and parent_id is null order by name`;
  const rows = (await query(sql, parentId ? [parentId] : [])).rows;
  res.json(rows);
});

app.get('/catalog', async (req, res) => {
  const schema = z.object({
    locationId: z.string().uuid(),
    category: z.enum(['equipment', 'stay', 'activity', 'rental']).optional(),
  });
  const p = schema.safeParse(req.query);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const { locationId, category } = p.data;
  const rows = (
    await query(
      `select l.*, p.name as partner_name from listings l
       join partners p on p.id=l.partner_id
       where l.status='active' and l.location_id=$1
       and ($2::text is null or l.category=$2)
       order by l.created_at desc`,
      [locationId, category || null]
    )
  ).rows;

  for (const row of rows) {
    const units = (await query(`select id,name,capacity from listing_units where listing_id=$1 and status='active' order by created_at`, [row.id])).rows;
    row.units = units;
  }

  res.json(rows);
});

app.get('/bundles', async (req, res) => {
  const p = z.object({ locationId: z.string().uuid() }).safeParse(req.query);
  if (!p.success) return res.status(400).json(p.error.flatten());

  const bundles = (await query(
    `select * from bundles where location_id=$1 and is_active=true order by created_at desc`,
    [p.data.locationId]
  )).rows;

  for (const b of bundles) {
    const items = (await query(
      `select l.id,l.title,l.category,l.metadata,bi.sort_order
       from bundle_items bi
       join listings l on l.id=bi.listing_id
       where bi.bundle_id=$1
       order by bi.sort_order asc`,
      [b.id]
    )).rows;
    b.items = items;
  }

  res.json(bundles);
});

app.get('/admin/bundles', requireAdmin, async (req, res) => {
  const rows = (await query(`select b.*, l.name as location_name from bundles b left join locations l on l.id=b.location_id order by b.created_at desc limit 200`)).rows;
  res.json(rows);
});

app.delete('/admin/bundles/:id', requireAdmin, async (req, res) => {
  const p = z.object({ id: z.string().uuid() }).safeParse(req.params);
  if (!p.success) return res.status(400).json(p.error.flatten());
  await query(`delete from bundles where id=$1`, [p.data.id]);
  res.json({ ok: true });
});

app.post('/admin/bundles', requireAdmin, async (req, res) => {
  const p = z.object({
    locationId: z.string().uuid(),
    title: z.string().min(2),
    description: z.string().optional(),
    priceLabel: z.string().optional(),
    imageUrl: z.string().optional(),
    listingIds: z.array(z.string().uuid()).min(1),
  }).safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());

  const client = await pool.connect();
  try {
    await client.query('begin');
    const b = (await client.query(
      `insert into bundles(location_id,title,description,price_label,image_url,is_active)
       values($1,$2,$3,$4,$5,true) returning *`,
      [p.data.locationId, p.data.title, p.data.description || null, p.data.priceLabel || null, p.data.imageUrl || null]
    )).rows[0];

    let i = 0;
    for (const lid of p.data.listingIds) {
      await client.query(`insert into bundle_items(bundle_id,listing_id,sort_order) values($1,$2,$3)`, [b.id, lid, i++]);
    }
    await client.query('commit');
    await sendTelegramNotify(`🧩 Новый пакет: ${b.title}`);
    res.status(201).json(b);
  } catch (e) {
    await client.query('rollback');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.post('/users/register', async (req, res) => {
  const schema = z.object({
    fullName: z.string().min(2),
    phone: z.string().min(6),
    telegramId: z.number().int().optional(),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());

  const { fullName, phone, telegramId } = p.data;
  const r = await query(
    `insert into users(telegram_id, full_name, phone, role)
     values($1,$2,$3,'user')
     on conflict (telegram_id)
     do update set full_name=excluded.full_name, phone=excluded.phone
     returning *`,
    [telegramId || null, fullName, phone]
  );
  await sendTelegramNotify(`👤 Новый пользователь: ${fullName} (${phone})`);
  res.status(201).json(r.rows[0]);
});

app.post('/partners/register', async (req, res) => {
  const schema = z.object({
    name: z.string().min(2),
    partnerType: z.enum(['ip', 'ooo', 'self_employed']),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    legal: z.object({
      inn: z.string().min(10),
      legalName: z.string().min(2),
      ogrn: z.string().optional(),
      ogrnip: z.string().optional(),
    }),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const { name, partnerType, email, phone, legal } = p.data;

  const client = await pool.connect();
  try {
    await client.query('begin');
    const pr = await client.query(
      `insert into partners(name,partner_type,email,phone,status)
       values($1,$2,$3,$4,'pending_verification') returning *`,
      [name, partnerType, email || null, phone || null]
    );
    await client.query(
      `insert into partner_legal_entities(partner_id,inn,ogrn,ogrnip,legal_name)
       values($1,$2,$3,$4,$5)`,
      [pr.rows[0].id, legal.inn, legal.ogrn || null, legal.ogrnip || null, legal.legalName]
    );
    await client.query('commit');
    await sendTelegramNotify(`🏢 Новый партнёр: ${name} (${partnerType})`);
    res.status(201).json(pr.rows[0]);
  } catch (e) {
    await client.query('rollback');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.get('/partners/:partnerId/dashboard', requireRole('partner','admin'), ensurePartnerAccess, async (req, res) => {
  const p = z.object({ partnerId: z.string().uuid() }).safeParse(req.params);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const { partnerId } = p.data;

  const partner = (await query(`select * from partners where id=$1`, [partnerId])).rows[0];
  if (!partner) return res.status(404).json({ error: 'Partner not found' });

  const [listings, bookings, integrations] = await Promise.all([
    query(`select id,title,category,status,created_at from listings where partner_id=$1 order by created_at desc limit 50`, [partnerId]),
    query(`select id,status,total_amount,created_at from bookings where partner_id=$1 order by created_at desc limit 50`, [partnerId]),
    query(`select id,type,status,base_url,created_at from partner_integrations where partner_id=$1 order by created_at desc`, [partnerId]),
  ]);

  res.json({ partner, listings: listings.rows, bookings: bookings.rows, integrations: integrations.rows });
});

app.post('/partners/:partnerId/integrations', requireRole('partner','admin'), ensurePartnerAccess, async (req, res) => {
  const params = z.object({ partnerId: z.string().uuid() });
  const body = z.object({
    type: z.enum(['api', 'csv', 'ical']),
    baseUrl: z.string().url().optional(),
    authType: z.enum(['api_key', 'oauth2', 'basic', 'none']).optional(),
    credentialsRef: z.string().optional(),
    config: z.record(z.string(), z.any()).optional(),
  });
  const pp = params.safeParse(req.params);
  const pb = body.safeParse(req.body);
  if (!pp.success || !pb.success) return res.status(400).json({ params: pp.error?.flatten(), body: pb.error?.flatten() });

  const { partnerId } = pp.data;
  const x = pb.data;
  const r = await query(
    `insert into partner_integrations(partner_id,type,base_url,auth_type,credentials_ref,config)
     values($1,$2,$3,$4,$5,$6) returning *`,
    [partnerId, x.type, x.baseUrl || null, x.authType || null, x.credentialsRef || null, x.config || {}]
  );
  res.status(201).json(r.rows[0]);
});

app.post('/partners/:partnerId/listings', requireRole('partner','admin'), ensurePartnerAccess, async (req, res) => {
  const params = z.object({ partnerId: z.string().uuid() });
  const body = z.object({
    locationId: z.string().uuid(),
    category: z.enum(['equipment', 'stay', 'activity', 'rental']),
    subcategory: z.string().optional(),
    title: z.string().min(2),
    description: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
    rental: z.object({
      unit: z.enum(['hour','day']).optional(),
      rate: z.number().positive().optional(),
      deposit: z.number().nonnegative().optional(),
      terms: z.string().max(1000).optional(),
    }).optional(),
    units: z
      .array(z.object({ name: z.string(), capacity: z.number().int().optional(), externalId: z.string().optional() }))
      .min(1),
  });

  const pp = params.safeParse(req.params);
  const pb = body.safeParse(req.body);
  if (!pp.success || !pb.success) return res.status(400).json({ params: pp.error?.flatten(), body: pb.error?.flatten() });

  const client = await pool.connect();
  try {
    await client.query('begin');
    const l = await client.query(
      `insert into listings(partner_id,location_id,category,subcategory,title,description,status,metadata)
       values($1,$2,$3,$4,$5,$6,'active',$7) returning *`,
      [pp.data.partnerId, pb.data.locationId, pb.data.category, pb.data.subcategory || null, pb.data.title, pb.data.description || null, { ...(pb.data.metadata || {}), ...(pb.data.rental ? { rental: pb.data.rental } : {}) }]
    );
    for (const u of pb.data.units) {
      await client.query(
        `insert into listing_units(listing_id,name,capacity,external_id,status)
         values($1,$2,$3,$4,'active')`,
        [l.rows[0].id, u.name, u.capacity || null, u.externalId || null]
      );
    }
    await client.query('commit');
    res.status(201).json(l.rows[0]);
  } catch (e) {
    await client.query('rollback');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.post('/availability/upsert', async (req, res) => {
  const body = z.object({
    unitId: z.string().uuid(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    isAvailable: z.boolean(),
    source: z.enum(['manual', 'sync']).default('manual'),
  });
  const p = body.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const b = p.data;
  const r = await query(
    `insert into availability_slots(unit_id,starts_at,ends_at,is_available,source)
     values($1,$2,$3,$4,$5)
     on conflict(unit_id,starts_at,ends_at)
     do update set is_available=excluded.is_available, source=excluded.source
     returning *`,
    [b.unitId, b.startsAt, b.endsAt, b.isAvailable, b.source]
  );
  res.status(201).json(r.rows[0]);
});

app.get('/availability/query', async (req, res) => {
  const p = z.object({
    unitId: z.string().uuid(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  }).safeParse(req.query);
  if (!p.success) return res.status(400).json(p.error.flatten());

  const { unitId, startsAt, endsAt } = p.data;

  const overlap = await query(
    `select bi.id from booking_items bi
     join bookings bk on bk.id=bi.booking_id
     where bi.unit_id=$1
       and tstzrange(bi.starts_at, bi.ends_at, '[)') && tstzrange($2::timestamptz,$3::timestamptz,'[)')
       and bk.status in ('hold','pending_payment','confirmed')
     limit 1`,
    [unitId, startsAt, endsAt]
  );

  const manualSlots = await query(
    `select * from availability_slots
     where unit_id=$1
       and starts_at <= $2::timestamptz
       and ends_at >= $3::timestamptz
     order by starts_at asc
     limit 1`,
    [unitId, startsAt, endsAt]
  );

  let available = overlap.rows.length === 0;
  if (manualSlots.rows.length) available = manualSlots.rows[0].is_available && available;

  res.json({ available, hasConflict: overlap.rows.length > 0, slotRule: manualSlots.rows[0] || null });
});

app.post('/bookings/hold', async (req, res) => {
  const body = z.object({
    userId: z.string().uuid().optional(),
    listingId: z.string().uuid(),
    unitId: z.string().uuid(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    price: z.number().positive(),
  });
  const p = body.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const b = p.data;

  const client = await pool.connect();
  try {
    await client.query('begin');

    const listing = (await client.query(`select id, partner_id, location_id from listings where id=$1 and status='active'`, [b.listingId])).rows[0];
    if (!listing) throw new Error('Listing not found');

    const overlap = await client.query(
      `select bi.id from booking_items bi
       join bookings bk on bk.id = bi.booking_id
       where bi.unit_id=$1
         and tstzrange(bi.starts_at, bi.ends_at, '[)') && tstzrange($2::timestamptz,$3::timestamptz,'[)')
         and bk.status in ('hold','pending_payment','confirmed')
       limit 1`,
      [b.unitId, b.startsAt, b.endsAt]
    );
    if (overlap.rows.length) {
      await client.query('rollback');
      return res.status(409).json({ error: 'Slot already reserved' });
    }

    const holdUntil = new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString();
    const booking = await client.query(
      `insert into bookings(user_id,partner_id,location_id,status,total_amount,currency,hold_expires_at)
       values($1,$2,$3,'hold',$4,'RUB',$5) returning *`,
      [b.userId || null, listing.partner_id, listing.location_id, b.price, holdUntil]
    );

    await client.query(
      `insert into booking_items(booking_id,listing_id,unit_id,starts_at,ends_at,price)
       values($1,$2,$3,$4,$5,$6)`,
      [booking.rows[0].id, b.listingId, b.unitId, b.startsAt, b.endsAt, b.price]
    );

    await client.query('commit');
    await sendTelegramNotify(`🕒 Новый hold: ${booking.rows[0].id} · сумма ${booking.rows[0].total_amount} RUB`);
    res.status(201).json(booking.rows[0]);
  } catch (e) {
    await client.query('rollback');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.post('/bookings/route-hold', async (req, res) => {
  const body = z.object({
    userId: z.string().uuid().optional(),
    items: z.array(z.object({
      listingId: z.string().uuid(),
      unitId: z.string().uuid(),
      startsAt: z.string().datetime(),
      endsAt: z.string().datetime(),
      price: z.number().positive(),
    })).min(1),
  });
  const p = body.safeParse(req.body);
  if (!p.success) return res.status(400).json(p.error.flatten());

  const client = await pool.connect();
  try {
    await client.query('begin');

    const grouped = new Map();
    for (const it of p.data.items) {
      const l = (await client.query(`select id, partner_id, location_id from listings where id=$1 and status='active'`, [it.listingId])).rows[0];
      if (!l) throw new Error('Listing not found');

      const overlap = await client.query(
        `select bi.id from booking_items bi
         join bookings bk on bk.id = bi.booking_id
         where bi.unit_id=$1
           and tstzrange(bi.starts_at, bi.ends_at, '[)') && tstzrange($2::timestamptz,$3::timestamptz,'[)')
           and bk.status in ('hold','pending_payment','confirmed')
         limit 1`,
        [it.unitId, it.startsAt, it.endsAt]
      );
      if (overlap.rows.length) {
        await client.query('rollback');
        return res.status(409).json({ error: 'One of route slots is already reserved' });
      }

      const key = `${l.partner_id}:${l.location_id}`;
      if (!grouped.has(key)) grouped.set(key, { partnerId: l.partner_id, locationId: l.location_id, items: [] });
      grouped.get(key).items.push(it);
    }

    const holdUntil = new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString();
    const bookings = [];

    for (const g of grouped.values()) {
      const total = g.items.reduce((a, x) => a + x.price, 0);
      const booking = await client.query(
        `insert into bookings(user_id,partner_id,location_id,status,total_amount,currency,hold_expires_at)
         values($1,$2,$3,'hold',$4,'RUB',$5) returning *`,
        [p.data.userId || null, g.partnerId, g.locationId, total, holdUntil]
      );

      for (const it of g.items) {
        await client.query(
          `insert into booking_items(booking_id,listing_id,unit_id,starts_at,ends_at,price)
           values($1,$2,$3,$4,$5,$6)`,
          [booking.rows[0].id, it.listingId, it.unitId, it.startsAt, it.endsAt, it.price]
        );
      }

      bookings.push(booking.rows[0]);
    }

    await client.query('commit');
    const totalAll = bookings.reduce((a, b) => a + Number(b.total_amount || 0), 0);
    await sendTelegramNotify(`🧭 Новый маршрут hold: заказов ${bookings.length} · модулей ${p.data.items.length} · сумма ${totalAll} RUB`);
    res.status(201).json({ ok: true, bookings, total: totalAll, groupedByPartners: bookings.length });
  } catch (e) {
    await client.query('rollback');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.post('/bookings/:id/pay', async (req, res) => {
  const params = z.object({ id: z.string().uuid() });
  const body = z.object({ provider: z.enum(['auto', 'mock', 'yookassa']).default('auto') });
  const pp = params.safeParse(req.params);
  const pb = body.safeParse(req.body || {});
  if (!pp.success || !pb.success) return res.status(400).json({ params: pp.error?.flatten(), body: pb.error?.flatten() });

  try {
    const out = await createPaymentForBooking({ bookingId: pp.data.id, provider: pb.data.provider });
    res.status(201).json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/payments/mock/:bookingId/success', async (req, res) => {
  const p = z.object({ bookingId: z.string().uuid() }).safeParse(req.params);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const booking = await markPaymentPaidByBooking(p.data.bookingId);
  await sendTelegramNotify(`✅ Бронь подтверждена: ${booking.id} · сумма ${booking.total_amount} RUB`);
  res.json({ ok: true, booking });
});

app.post('/bookings/:id/confirm', async (req, res) => {
  const p = z.object({ id: z.string().uuid() }).safeParse(req.params);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const r = await query(`update bookings set status='confirmed' where id=$1 returning *`, [p.data.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
  await sendTelegramNotify(`✅ Бронь подтверждена вручную: ${r.rows[0].id}`);
  res.json(r.rows[0]);
});

app.post('/bookings/:id/cancel', async (req, res) => {
  const p = z.object({ id: z.string().uuid() }).safeParse(req.params);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const r = await query(`update bookings set status='cancelled' where id=$1 returning *`, [p.data.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
  await sendTelegramNotify(`❌ Бронь отменена: ${r.rows[0].id}`);
  res.json(r.rows[0]);
});

app.post('/system/expire-holds', async (_, res) => {
  const r = await query(
    `update bookings set status='expired'
     where status='hold' and hold_expires_at < now()
     returning id`
  );
  res.json({ expired: r.rowCount });
});

// Favorites
app.get('/users/:userId/favorites', async (req, res) => {
  const p = z.object({ userId: z.string().uuid() }).safeParse(req.params);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const rows = (await query(
    `select f.created_at, l.* from favorites f
     join listings l on l.id=f.listing_id
     where f.user_id=$1
     order by f.created_at desc`,
    [p.data.userId]
  )).rows;
  res.json(rows);
});

app.get('/users/:userId/bookings', async (req, res) => {
  const p = z.object({ userId: z.string().uuid() }).safeParse(req.params);
  if (!p.success) return res.status(400).json(p.error.flatten());

  const rows = (await query(
    `select b.*, bi.listing_id, bi.unit_id, bi.starts_at, bi.ends_at, bi.price, l.title, l.category
     from bookings b
     left join booking_items bi on bi.booking_id=b.id
     left join listings l on l.id=bi.listing_id
     where b.user_id=$1
     order by b.created_at desc`,
    [p.data.userId]
  )).rows;

  res.json(rows);
});

app.get('/users/:userId/reviews', async (req, res) => {
  const p = z.object({ userId: z.string().uuid() }).safeParse(req.params);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const rows = (await query(
    `select r.*, l.title as listing_title
     from reviews r
     left join listings l on l.id=r.listing_id
     where r.user_id=$1
     order by r.created_at desc`,
    [p.data.userId]
  )).rows;
  res.json(rows);
});

app.post('/users/:userId/favorites', async (req, res) => {
  const pp = z.object({ userId: z.string().uuid() }).safeParse(req.params);
  const pb = z.object({ listingId: z.string().uuid() }).safeParse(req.body);
  if (!pp.success || !pb.success) return res.status(400).json({ params: pp.error?.flatten(), body: pb.error?.flatten() });

  const r = await query(
    `insert into favorites(user_id, listing_id)
     values($1,$2)
     on conflict(user_id, listing_id) do nothing
     returning *`,
    [pp.data.userId, pb.data.listingId]
  );
  res.status(201).json({ ok: true, added: !!r.rows.length });
});

app.delete('/users/:userId/favorites/:listingId', async (req, res) => {
  const p = z.object({ userId: z.string().uuid(), listingId: z.string().uuid() }).safeParse(req.params);
  if (!p.success) return res.status(400).json(p.error.flatten());
  await query(`delete from favorites where user_id=$1 and listing_id=$2`, [p.data.userId, p.data.listingId]);
  res.json({ ok: true });
});

// Reviews
app.get('/listings/:listingId/reviews', async (req, res) => {
  const p = z.object({ listingId: z.string().uuid() }).safeParse(req.params);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const rows = (await query(
    `select r.*, u.full_name from reviews r
     left join users u on u.id=r.user_id
     where r.listing_id=$1
     order by r.created_at desc`,
    [p.data.listingId]
  )).rows;
  const avg = (await query(`select round(avg(rating)::numeric,2) as avg_rating, count(*)::int as total from reviews where listing_id=$1`, [p.data.listingId])).rows[0];
  res.json({ avg, items: rows });
});

app.post('/listings/:listingId/reviews', async (req, res) => {
  const pp = z.object({ listingId: z.string().uuid() }).safeParse(req.params);
  const pb = z.object({ userId: z.string().uuid().optional(), rating: z.number().int().min(1).max(5), text: z.string().max(2000).optional() }).safeParse(req.body);
  if (!pp.success || !pb.success) return res.status(400).json({ params: pp.error?.flatten(), body: pb.error?.flatten() });
  const r = await query(
    `insert into reviews(user_id, listing_id, rating, text)
     values($1,$2,$3,$4)
     returning *`,
    [pb.data.userId || null, pp.data.listingId, pb.data.rating, pb.data.text || null]
  );
  res.status(201).json(r.rows[0]);
});

// Profile preferences for AI concierge
app.post('/users/:userId/preferences', async (req, res) => {
  const pp = z.object({ userId: z.string().uuid() }).safeParse(req.params);
  const pb = z.object({ preferences: z.record(z.string(), z.any()) }).safeParse(req.body);
  if (!pp.success || !pb.success) return res.status(400).json({ params: pp.error?.flatten(), body: pb.error?.flatten() });

  const r = await query(
    `insert into user_profiles(user_id, preferences, updated_at)
     values($1,$2,now())
     on conflict(user_id)
     do update set preferences=excluded.preferences, updated_at=now()
     returning *`,
    [pp.data.userId, pb.data.preferences]
  );
  res.json(r.rows[0]);
});

// Moderation flow
app.get('/partners/:partnerId/listings', requireRole('partner','admin'), ensurePartnerAccess, async (req, res) => {
  const p = z.object({ partnerId: z.string().uuid() }).safeParse(req.params);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const rows = (await query(
    `select l.*, (select count(*)::int from listing_units u where u.listing_id=l.id and u.status='active') as units_count
     from listings l where l.partner_id=$1 order by l.created_at desc`,
    [p.data.partnerId]
  )).rows;
  res.json(rows);
});

app.get('/partners/:partnerId/listings/:listingId/units', requireRole('partner','admin'), ensurePartnerAccess, async (req, res) => {
  const p = z.object({ partnerId: z.string().uuid(), listingId: z.string().uuid() }).safeParse(req.params);
  if (!p.success) return res.status(400).json(p.error.flatten());
  const own = (await query(`select id from listings where id=$1 and partner_id=$2`, [p.data.listingId, p.data.partnerId])).rows[0];
  if (!own) return res.status(404).json({ error: 'Listing not found for partner' });
  const rows = (await query(`select * from listing_units where listing_id=$1 and status='active' order by created_at`, [p.data.listingId])).rows;
  res.json(rows);
});

app.post('/partners/:partnerId/listings/:listingId/price', requireRole('partner','admin'), ensurePartnerAccess, async (req, res) => {
  const pp = z.object({ partnerId: z.string().uuid(), listingId: z.string().uuid() }).safeParse(req.params);
  const pb = z.object({ priceLabel: z.string().min(1) }).safeParse(req.body);
  if (!pp.success || !pb.success) return res.status(400).json({ params: pp.error?.flatten(), body: pb.error?.flatten() });

  const own = (await query(`select id, metadata from listings where id=$1 and partner_id=$2`, [pp.data.listingId, pp.data.partnerId])).rows[0];
  if (!own) return res.status(404).json({ error: 'Listing not found for partner' });

  const md = own.metadata || {};
  md.price_label = pb.data.priceLabel;
  const r = (await query(`update listings set metadata=$1 where id=$2 returning *`, [md, pp.data.listingId])).rows[0];
  res.json(r);
});

app.post('/partners/:partnerId/availability/bulk', requireRole('partner','admin'), ensurePartnerAccess, async (req, res) => {
  const pp = z.object({ partnerId: z.string().uuid() }).safeParse(req.params);
  const pb = z.object({
    unitId: z.string().uuid(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    isAvailable: z.boolean(),
  }).safeParse(req.body);
  if (!pp.success || !pb.success) return res.status(400).json({ params: pp.error?.flatten(), body: pb.error?.flatten() });

  const check = (await query(
    `select l.partner_id from listing_units u join listings l on l.id=u.listing_id where u.id=$1`,
    [pb.data.unitId]
  )).rows[0];
  if (!check || check.partner_id !== pp.data.partnerId) return res.status(403).json({ error: 'Unit not owned by partner' });

  const r = (await query(
    `insert into availability_slots(unit_id,starts_at,ends_at,is_available,source)
     values($1,$2,$3,$4,'manual')
     on conflict(unit_id,starts_at,ends_at)
     do update set is_available=excluded.is_available, source='manual'
     returning *`,
    [pb.data.unitId, pb.data.startsAt, pb.data.endsAt, pb.data.isAvailable]
  )).rows[0];

  res.json(r);
});

app.post('/partners/:partnerId/availability/sync-busy', requireRole('partner','admin'), ensurePartnerAccess, async (req, res) => {
  const pp = z.object({ partnerId: z.string().uuid() }).safeParse(req.params);
  const pb = z.object({
    source: z.string().default('partner_crm'),
    items: z.array(z.object({
      unitId: z.string().uuid(),
      startsAt: z.string().datetime(),
      endsAt: z.string().datetime(),
      externalRef: z.string().optional(),
    })).min(1).max(500),
  }).safeParse(req.body);
  if (!pp.success || !pb.success) return res.status(400).json({ params: pp.error?.flatten(), body: pb.error?.flatten() });

  const client = await pool.connect();
  try {
    await client.query('begin');
    let synced = 0;
    for (const it of pb.data.items) {
      const check = (await client.query(
        `select l.partner_id from listing_units u join listings l on l.id=u.listing_id where u.id=$1`,
        [it.unitId]
      )).rows[0];
      if (!check || check.partner_id !== pp.data.partnerId) continue;

      await client.query(
        `insert into availability_slots(unit_id,starts_at,ends_at,is_available,source)
         values($1,$2,$3,false,'sync')
         on conflict(unit_id,starts_at,ends_at)
         do update set is_available=false, source='sync'`,
        [it.unitId, it.startsAt, it.endsAt]
      );
      synced++;
    }
    await client.query('commit');
    await sendTelegramNotify(`🔄 Sync busy slots: partner ${pp.data.partnerId} · ${synced} слотов`);
    res.json({ ok: true, synced, source: pb.data.source });
  } catch (e) {
    await client.query('rollback');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

app.post('/partners/:partnerId/listings/:listingId/submit', requireRole('partner','admin'), ensurePartnerAccess, async (req, res) => {
  const p = z.object({ partnerId: z.string().uuid(), listingId: z.string().uuid() }).safeParse(req.params);
  if (!p.success) return res.status(400).json(p.error.flatten());

  const own = (await query(`select id from listings where id=$1 and partner_id=$2`, [p.data.listingId, p.data.partnerId])).rows[0];
  if (!own) return res.status(404).json({ error: 'Listing not found for partner' });

  await query(
    `insert into listing_moderation(listing_id,status,updated_at)
     values($1,'pending',now())
     on conflict(listing_id)
     do update set status='pending', reason=null, updated_at=now()`,
    [p.data.listingId]
  );
  await sendTelegramNotify(`📨 Карточка отправлена на модерацию: ${p.data.listingId}`);
  res.json({ ok: true, status: 'pending' });
});

app.get('/admin/listings/moderation', requireAdmin, async (_req, res) => {
  const rows = (await query(
    `select l.id, l.title, l.category, l.status as listing_status, m.status as moderation_status, m.reason, m.updated_at
     from listings l
     left join listing_moderation m on m.listing_id=l.id
     order by coalesce(m.updated_at, l.created_at) desc
     limit 200`
  )).rows;
  res.json(rows);
});

app.post('/admin/listings/:listingId/moderate', requireAdmin, async (req, res) => {
  const pp = z.object({ listingId: z.string().uuid() }).safeParse(req.params);
  const pb = z.object({ status: z.enum(['approved','rejected']), reason: z.string().optional() }).safeParse(req.body);
  if (!pp.success || !pb.success) return res.status(400).json({ params: pp.error?.flatten(), body: pb.error?.flatten() });

  await query(
    `insert into listing_moderation(listing_id,status,reason,updated_at)
     values($1,$2,$3,now())
     on conflict(listing_id)
     do update set status=excluded.status, reason=excluded.reason, updated_at=now()`,
    [pp.data.listingId, pb.data.status, pb.data.reason || null]
  );

  if (pb.data.status === 'approved') {
    await query(`update listings set status='active' where id=$1`, [pp.data.listingId]);
  } else {
    await query(`update listings set status='draft' where id=$1`, [pp.data.listingId]);
  }

  await sendTelegramNotify(`🛡️ Модерация: listing ${pp.data.listingId} → ${pb.data.status}${pb.data.reason ? ' · ' + pb.data.reason : ''}`);
  res.json({ ok: true });
});

app.post('/partners/:partnerId/import/csv', requireRole('partner','admin'), ensurePartnerAccess, async (req, res) => {
  const pp = z.object({ partnerId: z.string().uuid() }).safeParse(req.params);
  const pb = z.object({ csv: z.string().min(5), locationId: z.string().uuid() }).safeParse(req.body);
  if (!pp.success || !pb.success) return res.status(400).json({ params: pp.error?.flatten(), body: pb.error?.flatten() });

  const lines = pb.data.csv.trim().split(/\r?\n/);
  const header = lines.shift().split(',').map((s) => s.trim().toLowerCase());
  const col = (name) => header.indexOf(name);
  let imported = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split(',').map((s) => s.trim());
    const category = parts[col('category')] || 'activity';
    const title = parts[col('title')] || 'Без названия';
    const description = parts[col('description')] || '';
    const price = parts[col('price')] || 'по запросу';
    const image = parts[col('image_url')] || null;

    const listing = (await query(
      `insert into listings(partner_id,location_id,category,title,description,status,metadata)
       values($1,$2,$3,$4,$5,'active',$6)
       returning id`,
      [pp.data.partnerId, pb.data.locationId, ['equipment','stay','activity','rental'].includes(category) ? category : 'rental', title, description, { price_label: price, image_url: image }]
    )).rows[0];

    await query(`insert into listing_units(listing_id,name,capacity,status) values($1,'Юнит #1',2,'active')`, [listing.id]);
    imported++;
  }

  await sendTelegramNotify(`📦 CSV импорт: partner ${pp.data.partnerId} · импортировано ${imported}`);
  res.json({ ok: true, imported });
});

app.post('/partners/:partnerId/webhooks/:integrationId', requireRole('partner','admin'), ensurePartnerAccess, async (req, res) => {
  const pp = z.object({ partnerId: z.string().uuid(), integrationId: z.string().uuid() }).safeParse(req.params);
  if (!pp.success) return res.status(400).json(pp.error.flatten());

  await query(
    `insert into partner_sync_jobs(integration_id,job_type,status,started_at,finished_at,error_text)
     values($1,'booking_push','success',now(),now(),$2)`,
    [pp.data.integrationId, JSON.stringify(req.body || {})]
  );

  await sendTelegramNotify(`🔌 Webhook принят: partner ${pp.data.partnerId}, integration ${pp.data.integrationId}`);
  res.json({ ok: true });
});

const EXPIRE_INTERVAL_MS = Number(process.env.EXPIRE_INTERVAL_MS || 60_000);
setInterval(async () => {
  try {
    const r = await query(
      `update bookings set status='expired'
       where status='hold' and hold_expires_at < now()
       returning id`
    );
    if (r.rowCount > 0) {
      await sendTelegramNotify(`⏳ Истекли hold-брони: ${r.rowCount}`);
    }
  } catch {}
}, EXPIRE_INTERVAL_MS);

const port = Number(process.env.PORT || 3200);
app.listen(port, () => console.log(`baikal-booking api on :${port}`));
