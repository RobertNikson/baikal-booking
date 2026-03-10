import crypto from 'crypto';
import { query } from './db.js';

const YK_SHOP_ID = process.env.YOOKASSA_SHOP_ID;
const YK_SECRET = process.env.YOOKASSA_SECRET_KEY;
const BASE_URL = process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:3200';

const COMMISSION = {
  rental: Number(process.env.FEE_RENTAL_PCT || 0.12),
  activity: Number(process.env.FEE_ACTIVITY_PCT || 0.15),
  stay: Number(process.env.FEE_STAY_PCT || 0.10),
  equipment: Number(process.env.FEE_EQUIPMENT_PCT || 0.12),
};
const ACQUIRING = Number(process.env.ACQUIRING_PCT || 0.03);

function round2(n) { return Math.round(Number(n) * 100) / 100; }

async function calcSettlement(bookingId, fallbackTotal) {
  const rows = (await query(
    `select bi.price, l.category
     from booking_items bi
     join listings l on l.id=bi.listing_id
     where bi.booking_id=$1`,
    [bookingId]
  )).rows;

  const gross = rows.length ? rows.reduce((a, x) => a + Number(x.price || 0), 0) : Number(fallbackTotal || 0);
  const platform = rows.length
    ? rows.reduce((a, x) => a + Number(x.price || 0) * (COMMISSION[x.category] ?? 0.12), 0)
    : gross * 0.12;
  const acquiring = gross * ACQUIRING;
  const payout = gross - platform - acquiring;

  return {
    gross_amount: round2(gross),
    platform_fee_amount: round2(platform),
    acquiring_fee_amount: round2(acquiring),
    partner_payout_amount: round2(payout),
  };
}

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

  const settlement = await calcSettlement(bookingId, booking.total_amount);

  let paymentUrl = `${BASE_URL}/mock-pay/${bookingId}`;
  let providerPaymentId = null;
  let finalProvider = provider;

  if ((provider === 'yookassa' || provider === 'auto') && YK_SHOP_ID && YK_SECRET) {
    const yk = await createYookassaPayment({
      bookingId,
      amount: Number(settlement.gross_amount),
      description: `Baikal booking ${bookingId}`,
    });
    providerPaymentId = yk.id;
    paymentUrl = yk.confirmation?.confirmation_url || paymentUrl;
    finalProvider = 'yookassa';
  } else {
    finalProvider = 'mock';
  }

  const p = await query(
    `insert into payments(booking_id,provider,provider_payment_id,status,amount,gross_amount,platform_fee_amount,acquiring_fee_amount,partner_payout_amount)
     values($1,$2,$3,'pending',$4,$5,$6,$7,$8)
     returning *`,
    [bookingId, finalProvider, providerPaymentId, settlement.gross_amount, settlement.gross_amount, settlement.platform_fee_amount, settlement.acquiring_fee_amount, settlement.partner_payout_amount]
  );

  await query(
    `update bookings set status='pending_payment', gross_amount=$2, platform_fee_amount=$3, acquiring_fee_amount=$4, partner_payout_amount=$5 where id=$1`,
    [bookingId, settlement.gross_amount, settlement.platform_fee_amount, settlement.acquiring_fee_amount, settlement.partner_payout_amount]
  );

  return { payment: p.rows[0], paymentUrl, settlement };
}

export async function markPaymentPaidByBooking(bookingId, providerPaymentId = null) {
  await query(`update payments set status='paid', provider_payment_id=coalesce($2, provider_payment_id) where booking_id=$1`, [bookingId, providerPaymentId]);
  const b = await query(`update bookings set status='confirmed' where id=$1 returning *`, [bookingId]);
  return b.rows[0];
}
