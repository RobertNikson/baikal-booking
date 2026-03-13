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
app.use(express.static('public'));

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
      })
    });

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);

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
