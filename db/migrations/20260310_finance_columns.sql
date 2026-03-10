alter table bookings add column if not exists gross_amount numeric(12,2);
alter table bookings add column if not exists platform_fee_amount numeric(12,2);
alter table bookings add column if not exists acquiring_fee_amount numeric(12,2);
alter table bookings add column if not exists partner_payout_amount numeric(12,2);

alter table payments add column if not exists gross_amount numeric(12,2);
alter table payments add column if not exists platform_fee_amount numeric(12,2);
alter table payments add column if not exists acquiring_fee_amount numeric(12,2);
alter table payments add column if not exists partner_payout_amount numeric(12,2);
