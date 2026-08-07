-- Store Branding & Custom Logo Table in Supabase
-- Stores cloud-synced logo, theme colors, banners, and social links per store.

create table if not exists public.store_branding (
  store_id text primary key default 'trending-juice',
  logo_url text not null default '',
  banner_url text not null default '',
  restaurant_name varchar(100) not null default 'Trending Juice',
  tagline varchar(200) not null default 'Fresh. Fun. You.',
  accent_color varchar(20) not null default '#FF9E1B',
  secondary_color varchar(20) not null default '#FF4D8D',
  bg_start varchar(20) not null default '#040406',
  bg_end varchar(20) not null default '#0B0B0F',
  kiosk_welcome text not null default '',
  kiosk_footer text not null default '',
  instagram text not null default '',
  facebook text not null default '',
  google_maps text not null default '',
  zomato text not null default '',
  swiggy text not null default '',
  whatsapp text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.store_branding enable row level security;

-- Allow public read access for customer storefronts, kiosks, and staff browsers
drop policy if exists "Public read store_branding" on public.store_branding;
create policy "Public read store_branding" on public.store_branding
  for select to public using (true);

-- Allow authenticated users to manage store branding
drop policy if exists "Authenticated manage store_branding" on public.store_branding;
create policy "Authenticated manage store_branding" on public.store_branding
  for all to authenticated using (true) with check (true);

-- Grant permissions
grant select on public.store_branding to anon, authenticated;
grant all on public.store_branding to service_role;

-- Seed default initial row for trending-juice
insert into public.store_branding (store_id, restaurant_name, tagline)
values ('trending-juice', 'Trending Juice', 'Fresh. Fun. You.')
on conflict (store_id) do nothing;
