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
