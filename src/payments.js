import crypto from 'crypto';
import { query } from './db.js';

const YK_SHOP_ID = process.env.YOOKASSA_SHOP_ID;
const YK_SECRET = process.env.YOOKASSA_SECRET_KEY;
const BASE_URL = process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:3200';

async function createYookassaPayment({ bookingId, amount, description }) {
  const idempotenceKey = crypto.randomUUID();
  const response = await fetch('https://api.yookassa.ru/v3/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(`${YK_SHOP_ID}:${YK_SECRET}`).toString('base64'),
      'Idempotence-Key': idempotenceKey,
    },
    body: JSON.stringify({
      amount: { value: amount.toFixed(2), currency: 'RUB' },
      capture: true,
      confirmation: {
        type: 'redirect',
        return_url: `${BASE_URL}/payment/return?bookingId=${bookingId}`,
      },
      description,
      metadata: { bookingId },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`YooKassa error: ${text}`);
  }
  return response.json();
}

export async function createPaymentForBooking({ bookingId, provider = 'mock' }) {
  const booking = (await query('select * from bookings where id=$1', [bookingId])).rows[0];
  if (!booking) throw new Error('Booking not found');

  let paymentUrl = `${BASE_URL}/mock-pay/${bookingId}`;
  let providerPaymentId = null;
  let finalProvider = provider;

  if ((provider === 'yookassa' || provider === 'auto') && YK_SHOP_ID && YK_SECRET) {
    const yk = await createYookassaPayment({
      bookingId,
      amount: Number(booking.total_amount),
      description: `Baikal booking ${bookingId}`,
    });
    providerPaymentId = yk.id;
    paymentUrl = yk.confirmation?.confirmation_url || paymentUrl;
    finalProvider = 'yookassa';
  } else {
    finalProvider = 'mock';
  }

  const p = await query(
    `insert into payments(booking_id,provider,provider_payment_id,status,amount)
     values($1,$2,$3,'pending',$4)
     returning *`,
    [bookingId, finalProvider, providerPaymentId, booking.total_amount]
  );

  await query(`update bookings set status='pending_payment' where id=$1`, [bookingId]);

  return { payment: p.rows[0], paymentUrl };
}

export async function markPaymentPaidByBooking(bookingId, providerPaymentId = null) {
  await query(`update payments set status='paid', provider_payment_id=coalesce($2, provider_payment_id) where booking_id=$1`, [bookingId, providerPaymentId]);
  const b = await query(`update bookings set status='confirmed' where id=$1 returning *`, [bookingId]);
  return b.rows[0];
}
