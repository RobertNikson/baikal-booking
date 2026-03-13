import 'dotenv/config';

const token = process.env.TELEGRAM_BOT_TOKEN;
const managerChatId = process.env.MANAGER_CHAT_ID;

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is required');
  process.exit(1);
}

const api = `https://api.telegram.org/bot${token}`;
const state = new Map(); // chatId -> draft

async function tg(method, body) {
  const res = await fetch(`${api}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function send(chatId, text) {
  return tg('sendMessage', { chat_id: chatId, text });
}

function extractLeadId(text = '') {
  const m = text.match(/^\/start(?:\s+lead_([\w-]+))?/i);
  return m?.[1] || null;
}

async function handleMessage(msg) {
  const chatId = msg.chat?.id;
  const text = (msg.text || '').trim();
  if (!chatId || !text) return;

  if (text.startsWith('/start')) {
    const leadId = extractLeadId(text);
    state.set(chatId, { step: 'dates', leadId, data: {} });
    await send(
      chatId,
      leadId
        ? `Заявка на объект ${leadId}. Укажи даты аренды (например: 15.07–20.07).`
        : 'Привет! Помогу с арендой/прокатом на Байкале. Укажи даты аренды (например: 15.07–20.07).'
    );
    return;
  }

  const s = state.get(chatId);
  if (!s) {
    await send(chatId, 'Напиши /start чтобы начать бронирование.');
    return;
  }

  if (s.step === 'dates') {
    s.data.dates = text;
    s.step = 'guests';
    await send(chatId, 'Сколько гостей/человек?');
    return;
  }

  if (s.step === 'guests') {
    s.data.guests = text;
    s.step = 'phone';
    await send(chatId, 'Оставь номер телефона для связи.');
    return;
  }

  if (s.step === 'phone') {
    s.data.phone = text;
    s.step = 'done';

    const summary = [
      '🔥 Новый лид BaikalRent',
      `Listing: ${s.leadId || 'не указан'}`,
      `Даты: ${s.data.dates}`,
      `Гостей: ${s.data.guests}`,
      `Телефон: ${s.data.phone}`,
      `User: @${msg.from?.username || 'no_username'} (id:${msg.from?.id})`,
    ].join('\n');

    if (managerChatId) {
      await send(managerChatId, summary);
    }

    await send(
      chatId,
      'Спасибо! Заявка принята ✅ Менеджер свяжется с тобой в ближайшее время.'
    );
    state.delete(chatId);
  }
}

async function main() {
  console.log('BaikalRent bot polling started');
  let offset = 0;
  while (true) {
    try {
      const r = await tg('getUpdates', { timeout: 30, offset });
      if (!r.ok) throw new Error(JSON.stringify(r));
      for (const upd of r.result) {
        offset = upd.update_id + 1;
        if (upd.message) await handleMessage(upd.message);
      }
    } catch (e) {
      console.error('poll error', e.message);
      await new Promise((res) => setTimeout(res, 2000));
    }
  }
}

main();
