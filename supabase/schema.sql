create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text default 'light',
  lang text default 'en',
  background_image_url text default '',
  background_brightness integer default 72,
  background_blur integer default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.social_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  x_url text default '',
  instagram_url text default '',
  github_url text default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  title text not null,
  slot integer not null default 0,
  custom_logo_url text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists favorites_user_id_idx on public.favorites(user_id);
create unique index if not exists favorites_user_url_idx on public.favorites(user_id, url);

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.social_links enable row level security;
alter table public.favorites enable row level security;

create policy "profiles_select_own" on public.profiles
for select using (auth.uid() = id);

create policy "profiles_insert_own" on public.profiles
for insert with check (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
for update using (auth.uid() = id);

create policy "user_settings_select_own" on public.user_settings
for select using (auth.uid() = user_id);

create policy "user_settings_insert_own" on public.user_settings
for insert with check (auth.uid() = user_id);

create policy "user_settings_update_own" on public.user_settings
for update using (auth.uid() = user_id);

create policy "social_links_select_own" on public.social_links
for select using (auth.uid() = user_id);

create policy "social_links_insert_own" on public.social_links
for insert with check (auth.uid() = user_id);

create policy "social_links_update_own" on public.social_links
for update using (auth.uid() = user_id);

create policy "favorites_select_own" on public.favorites
for select using (auth.uid() = user_id);

create policy "favorites_insert_own" on public.favorites
for insert with check (auth.uid() = user_id);

create policy "favorites_update_own" on public.favorites
for update using (auth.uid() = user_id);

create policy "favorites_delete_own" on public.favorites
for delete using (auth.uid() = user_id);
