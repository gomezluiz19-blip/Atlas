-- Terreno's servers: run this once in a new Supabase project (SQL editor › New query › Run).
-- Everything is protected by row-level security: anyone can read what's public; people can
-- only write their own things. The story library has its own file (stories-backend.sql).

-- ---------------------------------------------------------------------------------------------
-- Pages about people
create table if not exists profiles (
  user_id    uuid primary key references auth.users on delete cascade,
  handle     text not null unique check (handle ~ '^[a-z0-9._]{2,24}$'),
  name       text not null,
  body       jsonb not null,                     -- the whole page (Top 8, spots, journal…)
  lon        double precision,                   -- home, for "people near here"
  lat        double precision,
  public     boolean not null default true,
  updated_at timestamptz not null default now()
);
create index if not exists profiles_where on profiles (lat, lon);
alter table profiles enable row level security;
create policy "read public pages" on profiles for select using (public or user_id = auth.uid());
create policy "write your page"  on profiles for insert with check (user_id = auth.uid());
create policy "edit your page"   on profiles for update using (user_id = auth.uid());
create policy "delete your page" on profiles for delete using (user_id = auth.uid());

-- Guestbooks
create table if not exists signatures (
  id          bigserial primary key,
  page        text not null references profiles (handle) on update cascade on delete cascade,
  from_user   uuid not null references auth.users on delete cascade default auth.uid(),
  from_handle text not null,
  name        text not null,
  text        text not null check (char_length(text) between 1 and 500),
  at          timestamptz not null default now()
);
create index if not exists signatures_page on signatures (page, at desc);
alter table signatures enable row level security;
create policy "read guestbooks" on signatures for select using (true);
create policy "sign as yourself" on signatures for insert with check (from_user = auth.uid());
create policy "remove your own or on your page" on signatures for delete using (
  from_user = auth.uid() or exists (select 1 from profiles p where p.handle = page and p.user_id = auth.uid()));

-- Follows
create table if not exists follows (
  follower uuid not null references auth.users on delete cascade default auth.uid(),
  handle   text not null references profiles (handle) on update cascade on delete cascade,
  at       timestamptz not null default now(),
  primary key (follower, handle)
);
alter table follows enable row level security;
create policy "read follows"  on follows for select using (true);
create policy "follow"        on follows for insert with check (follower = auth.uid());
create policy "unfollow"      on follows for delete using (follower = auth.uid());

-- Lenses and guides people make (published for everyone)
create table if not exists lenses (
  id         text primary key,
  author     uuid not null references auth.users on delete cascade default auth.uid(),
  body       jsonb not null,
  updated_at timestamptz not null default now()
);
alter table lenses enable row level security;
create policy "read lenses"   on lenses for select using (true);
create policy "make lenses"   on lenses for insert with check (author = auth.uid());
create policy "edit lenses"   on lenses for update using (author = auth.uid());
create policy "delete lenses" on lenses for delete using (author = auth.uid());

create table if not exists guides (
  id         text primary key,
  author     uuid not null references auth.users on delete cascade default auth.uid(),
  body       jsonb not null,
  lon        double precision,
  lat        double precision,
  updated_at timestamptz not null default now()
);
alter table guides enable row level security;
create policy "read guides"   on guides for select using (true);
create policy "make guides"   on guides for insert with check (author = auth.uid());
create policy "edit guides"   on guides for update using (author = auth.uid());
create policy "delete guides" on guides for delete using (author = auth.uid());

-- Private things that follow you between devices: field notes, watches, My Place data.
create table if not exists private_items (
  user_id    uuid not null references auth.users on delete cascade default auth.uid(),
  kind       text not null,                      -- 'note' | 'watch' | 'myplace' | …
  id         text not null,
  body       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);
alter table private_items enable row level security;
create policy "only you" on private_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Browser push subscriptions, for alerts when Terreno is closed (see backend.md › Alerts).
create table if not exists push_subscriptions (
  user_id  uuid not null references auth.users on delete cascade default auth.uid(),
  endpoint text primary key,
  body     jsonb not null
);
alter table push_subscriptions enable row level security;
create policy "only you" on push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Photos for field notes and pages: a public bucket, each person writing only in their own folder.
insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict do nothing;
create policy "read media" on storage.objects for select using (bucket_id = 'media');
create policy "upload to your folder" on storage.objects for insert with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "replace in your folder" on storage.objects for update using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete in your folder" on storage.objects for delete using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- Deleting your own account from the app (Account › Delete my account). Everything above cascades from auth.users.
create or replace function delete_me() returns void language sql security definer set search_path = public as $$
  delete from auth.users where id = auth.uid();
$$;
revoke all on function delete_me() from public;
grant execute on function delete_me() to authenticated;
