create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint unique,
  full_name text,
  phone text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references locations(id) on delete set null,
  name text not null,
  slug text not null unique,
  type text not null check (type in ('region','area','settlement','bay','poi')),
  lat numeric(9,6),
  lng numeric(9,6),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  partner_type text not null check (partner_type in ('ip','ooo','self_employed')),
  status text not null default 'pending_verification' check (status in ('draft','pending_verification','active','suspended')),
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists partner_legal_entities (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  inn text not null,
  ogrn text,
  ogrnip text,
  legal_name text not null,
  bank_details jsonb,
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists partner_integrations (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  type text not null check (type in ('api','csv','ical')),
  status text not null default 'active' check (status in ('active','paused','error')),
  base_url text,
  auth_type text check (auth_type in ('api_key','oauth2','basic','none')),
  credentials_ref text,
  config jsonb,
  created_at timestamptz not null default now()
);

create table if not exists listings (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  location_id uuid not null references locations(id),
  category text not null check (category in ('equipment','stay','activity')),
  subcategory text,
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists listing_units (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  external_id text,
  name text not null,
  capacity int,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now()
);

create table if not exists availability_slots (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references listing_units(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_available boolean not null,
  source text not null default 'manual' check (source in ('manual','sync')),
  unique (unit_id, starts_at, ends_at)
);

create table if not exists pricing_rules (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  unit_id uuid references listing_units(id) on delete cascade,
  rule_type text not null check (rule_type in ('base','weekday','weekend','season','holiday')),
  price numeric(12,2) not null,
  currency text not null default 'RUB',
  starts_at timestamptz,
  ends_at timestamptz
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  partner_id uuid not null references partners(id),
  location_id uuid not null references locations(id),
  status text not null check (status in ('hold','pending_payment','confirmed','cancelled','expired','completed')),
  total_amount numeric(12,2) not null,
  currency text not null default 'RUB',
  hold_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  listing_id uuid not null references listings(id),
  unit_id uuid not null references listing_units(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  price numeric(12,2) not null
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  provider text not null,
  provider_payment_id text,
  status text not null check (status in ('created','pending','paid','failed','refunded')),
  amount numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists partner_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references partner_integrations(id) on delete cascade,
  job_type text not null check (job_type in ('catalog','availability','pricing','booking_push')),
  status text not null check (status in ('queued','running','success','failed')),
  started_at timestamptz,
  finished_at timestamptz,
  error_text text
);

create index if not exists idx_listings_location_category on listings(location_id, category) where status='active';
create index if not exists idx_slots_unit_time on availability_slots(unit_id, starts_at, ends_at);
create index if not exists idx_bookings_partner_status on bookings(partner_id, status, created_at desc);
