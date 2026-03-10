import crypto from 'crypto';
import { query } from './db.js';

function parseInitData(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  return { hash, dataCheckString, params };
}

export function verifyTelegramInitData(initData, botToken) {
  if (!initData || !botToken) return false;
  const { hash, dataCheckString } = parseInitData(initData);
  if (!hash) return false;

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const check = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(check), Buffer.from(hash));
}

export async function upsertUserFromInitData(initData) {
  const params = new URLSearchParams(initData);
  const userRaw = params.get('user');
  if (!userRaw) throw new Error('No user in initData');
  const tgUser = JSON.parse(userRaw);

  const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ').trim() || null;
  const r = await query(
    `insert into users(telegram_id, full_name)
     values($1, $2)
     on conflict (telegram_id)
     do update set full_name = excluded.full_name
     returning *`,
    [tgUser.id, fullName]
  );
  return r.rows[0];
}
