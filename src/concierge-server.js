import express from 'express';
import dotenv from 'dotenv';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { query, pool } from './db.js';
import { verifyTelegramInitData, upsertUserFromInitData } from './telegramAuth.js';

dotenv.config();

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.static('public'));

function signToken(payload) {
  const secret = process.env.JWT_SECRET || 'baikal_secret_key_2024';
  return jwt.sign(payload, secret, { expiresIn: '30d' });
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || 'baikal_secret_key_2024', (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// --- Auth Routes ---

app.post('/api/auth/telegram', async (req, res) => {
  const { initData } = req.body;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!verifyTelegramInitData(initData, botToken)) {
    return res.status(401).json({ error: 'Invalid initData' });
  }

  try {
    const user = await upsertUserFromInitData(initData);
    const partner = (await query('SELECT * FROM partners WHERE id IN (SELECT partner_id FROM partner_users WHERE user_id = $1)', [user.id])).rows[0];
    
    const token = signToken({ 
      userId: user.id, 
      telegramId: user.telegram_id,
      partnerId: partner?.id || null,
      role: user.role 
    });

    res.json({ token, user, partner });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Partner Routes ---

app.post('/api/partners/register', authenticateToken, async (req, res) => {
  const { name, partnerType, phone, email } = req.body;
  const userId = req.user.userId;

  try {
    const client = await pool.connect();
    await client.query('BEGIN');
    
    const partner = (await client.query(
      'INSERT INTO partners (name, partner_type, phone, email, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, partnerType, phone, email, 'active']
    )).rows[0];

    // Create relation between user and partner
    await client.query(
      'INSERT INTO partner_users (partner_id, user_id) VALUES ($1, $2)',
      [partner.id, userId]
    );

    await client.query('COMMIT');
    client.release();

    res.json({ partner });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/partners/my-listings', authenticateToken, async (req, res) => {
  if (!req.user.partnerId) return res.status(403).json({ error: 'Not a partner' });
  
  try {
    const rows = (await query('SELECT * FROM listings WHERE partner_id = $1 ORDER BY created_at DESC', [req.user.partnerId])).rows;
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/listings', authenticateToken, async (req, res) => {
  if (!req.user.partnerId) return res.status(403).json({ error: 'Not a partner' });
  
  const { title, category, locationId, description, metadata } = req.body;
  try {
    const row = (await query(
      'INSERT INTO listings (partner_id, location_id, category, title, description, metadata, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [req.user.partnerId, locationId, category, title, description, metadata, 'active']
    )).rows[0];
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/listings/:id', authenticateToken, async (req, res) => {
  if (!req.user.partnerId) return res.status(403).json({ error: 'Not a partner' });
  
  const { id } = req.params;
  const { title, category, locationId, description, metadata } = req.body;
  try {
    const row = (await query(
      'UPDATE listings SET title=$1, category=$2, location_id=$3, description=$4, metadata=$5 WHERE id=$6 AND partner_id=$7 RETURNING *',
      [title, category, locationId, description, metadata, id, req.user.partnerId]
    )).rows[0];
    if (!row) return res.status(404).json({ error: 'Listing not found or not owned' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/listings/:id', authenticateToken, async (req, res) => {
  if (!req.user.partnerId) return res.status(403).json({ error: 'Not a partner' });
  const { id } = req.params;
  try {
    await query('DELETE FROM listings WHERE id=$1 AND partner_id=$2', [id, req.user.partnerId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Existing Routes ---

app.get('/api/locations', async (_req, res) => {
  try {
    const rows = (await query(`
      select id, name, slug, type, is_active, metadata
      from locations
      where is_active=true
      order by name
    `)).rows;
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// AI Assistant Endpoint with DB awareness (Simulated Search for now)
app.post('/api/ai/concierge', async (req, res) => {
  const { message, history = [], userId } = req.body;
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) return res.status(503).json({ error: 'AI key not set' });

  try {
    // 1. Get available locations for context
    const locRows = (await query('SELECT name, type FROM locations WHERE is_active=true')).rows;
    const locationContext = locRows.map(r => `${r.name} (${r.type})`).join(', ');
    
    // 2. Simple intent detection (can be improved with specialized prompt)
    const prompt = `
      Ты — AI-консьерж сервиса BaikalRent. Помогаешь туристам найти жилье, технику или экскурсии на Байкале.
      Доступные локации: ${locationContext}.
      
      Твоя задача:
      - Быть кратким, дружелюбным и полезным.
      - Если пользователь ищет что-то конкретное (место, даты, количество человек), подтверди параметры.
      - Категории: проживание, прокат, покушать, экскурсии (пешие/с гидом/на транспорте), точки интереса (музеи, клубы, бары, нерпинарии, зоопарки), пакеты отдыха (1-7 дней).
      - Используй названия локаций из списка выше.
      - Если в базе есть подходящие варианты (сейчас симулируем поиск), предложи их.
      
      Отвечай в формате JSON:
      {
        "text": "Твой ответ пользователю",
        "action": "search | chat",
        "params": { "location": "...", "category": "...", "guests": 0 }
      }
    `;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);

    console.log('Request to AI concierge:', { message, userId });
    
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: prompt },
          ...history,
          { role: 'user', content: message }
        ],
        response_format: { type: 'json_object' }
      }),
      signal: ctrl.signal,
    });

    clearTimeout(t);

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || 'AI provider error' });
    }
    const raw = data?.choices?.[0]?.message?.content;
    const result = raw ? JSON.parse(raw) : { text: 'Не удалось получить ответ.', action: 'chat', params: {} };

    // 3. If action is search, fetch real listings with units
    let listings = [];
    if (result.action === 'search') {
      const searchQuery = `
        SELECT l.*, p.name as partner_name, 
        (SELECT json_agg(u) FROM listing_units u WHERE u.listing_id = l.id AND u.status = 'active') as units
        FROM listings l 
        JOIN partners p ON p.id = l.partner_id
        WHERE l.status = 'active' 
        AND (l.title ILIKE $1 OR l.description ILIKE $1 OR l.subcategory ILIKE $1)
        LIMIT 5
      `;
      listings = (await query(searchQuery, [`%${result.params.location || result.params.category || ''}%`])).rows;
    }

    res.json({ ...result, listings });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Basic Auth & Profile Endpoints from original server.js (omitted for brevity here but kept in actual file)
// ... keeping existing routes from server.js ...

const port = process.env.PORT || 3200;
app.listen(port, () => console.log(`BaikalRent Concierge API on :${port}`));
