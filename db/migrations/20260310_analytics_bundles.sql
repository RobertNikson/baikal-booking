create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  user_id uuid null,
  listing_id uuid null,
  location_id uuid null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_analytics_events_type_time on analytics_events(event_type, created_at desc);

create table if not exists bundles (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id),
  title text not null,
  description text,
  price_label text,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists bundle_items (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references bundles(id) on delete cascade,
  listing_id uuid not null references listings(id) on delete cascade,
  sort_order int not null default 0
);
