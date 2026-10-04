-- Terreno story library: one table and four functions on Supabase (Postgres).
-- Run it once in the Supabase SQL editor. Anyone can read published stories;
-- writes only go through the functions, which check what's sent. A story's
-- author gets an edit key (kept on their device) to update it later.

create extension if not exists pgcrypto;

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 140),
  summary text not null default '' check (char_length(summary) <= 600),
  author jsonb not null,
  tags text[] not null default '{}',
  level text,
  lineage jsonb not null default '[]',
  links jsonb not null default '[]',
  body jsonb not null,
  slide_count int not null,
  cover text,
  west double precision not null, south double precision not null, east double precision not null, north double precision not null,
  uses int not null default 0,
  remixes int not null default 0,
  likes int not null default 0,
  reports int not null default 0,
  score double precision generated always as (ln(1 + uses + 3 * remixes + 2 * likes)) stored,
  search tsvector,
  edit_key_hash text not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stories_search on public.stories using gin (search);
create index if not exists stories_tags on public.stories using gin (tags);
create index if not exists stories_box on public.stories (west, east, south, north);
create index if not exists stories_score on public.stories (score desc, updated_at desc);

create or replace function public.stories_index() returns trigger language plpgsql as $$
begin
  new.search :=
    setweight(to_tsvector('simple', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('simple', array_to_string(new.tags, ' ')), 'B') ||
    setweight(to_tsvector('simple', coalesce(new.summary, '') || ' ' || coalesce(new.author->>'name', '')), 'C') ||
    setweight(to_tsvector('simple', coalesce((select string_agg(coalesce(x->>'title', '') || ' ' || coalesce(x->>'text', ''), ' ') from jsonb_array_elements(new.body->'slides') x), '')), 'D');
  return new;
end $$;
drop trigger if exists stories_index on public.stories;
create trigger stories_index before insert or update on public.stories for each row execute function public.stories_index();

-- Reading: every column but the edit key, and only stories that aren't hidden.
alter table public.stories enable row level security;
drop policy if exists "read published stories" on public.stories;
create policy "read published stories" on public.stories for select using (not hidden);
revoke all on public.stories from anon, authenticated;
grant select (id, title, summary, author, tags, level, lineage, links, body, slide_count, cover, west, south, east, north,
  uses, remixes, likes, score, search, created_at, updated_at) on public.stories to anon, authenticated;

create or replace function public.story_fields(p jsonb) returns record language plpgsql immutable as $$
declare r record;
begin
  if jsonb_typeof(p->'slides') is distinct from 'array' or jsonb_array_length(p->'slides') not between 1 and 60 then
    raise exception 'A story needs between 1 and 60 slides';
  end if;
  if octet_length(p::text) > 600000 then raise exception 'That story is too large'; end if;
  select
    left(coalesce(nullif(trim(p->>'title'), ''), 'Untitled story'), 140) as title,
    left(coalesce(p->>'summary', ''), 600) as summary,
    jsonb_build_object('name', left(coalesce(nullif(trim(p->'author'->>'name'), ''), 'Anonymous'), 80)) as author,
    coalesce((select array_agg(left(t, 40)) from (select jsonb_array_elements_text(coalesce(p->'tags', '[]')) t limit 8) q), '{}') as tags,
    left(p->>'level', 40) as level,
    coalesce(p->'lineage', '[]') as lineage,
    coalesce(p->'links', '[]') as links,
    (p - 'stats' - 'id' - 'featured') as body,
    jsonb_array_length(p->'slides') as slide_count,
    case when p->'slides'->0->>'thumb' like 'data:image/%' then left(p->'slides'->0->>'thumb', 120000) end as cover,
    greatest(-180, least(180, coalesce((p->'bbox'->>0)::float8, 0))) as west,
    greatest(-90, least(90, coalesce((p->'bbox'->>1)::float8, 0))) as south,
    greatest(-180, least(180, coalesce((p->'bbox'->>2)::float8, 0))) as east,
    greatest(-90, least(90, coalesce((p->'bbox'->>3)::float8, 0))) as north
  into r;
  return r;
end $$;

create or replace function public.publish_story(p jsonb, p_key text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare f record; new_id uuid;
begin
  if char_length(coalesce(p_key, '')) < 16 then raise exception 'Missing edit key'; end if;
  select * into f from public.story_fields(p) as (title text, summary text, author jsonb, tags text[], level text, lineage jsonb, links jsonb, body jsonb, slide_count int, cover text, west float8, south float8, east float8, north float8);
  insert into public.stories (title, summary, author, tags, level, lineage, links, body, slide_count, cover, west, south, east, north, edit_key_hash)
  values (f.title, f.summary, f.author, f.tags, f.level, f.lineage, f.links, f.body, f.slide_count, f.cover, f.west, f.south, f.east, f.north, crypt(p_key, gen_salt('bf')))
  returning id into new_id;
  return new_id;
end $$;

create or replace function public.update_story(p_id uuid, p_key text, p jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare f record;
begin
  if not exists (select 1 from public.stories where id = p_id and edit_key_hash = crypt(p_key, edit_key_hash)) then
    raise exception 'Only the author can update this story';
  end if;
  select * into f from public.story_fields(p) as (title text, summary text, author jsonb, tags text[], level text, lineage jsonb, links jsonb, body jsonb, slide_count int, cover text, west float8, south float8, east float8, north float8);
  update public.stories set title = f.title, summary = f.summary, author = f.author, tags = f.tags, level = f.level, lineage = f.lineage,
    links = f.links, body = f.body, slide_count = f.slide_count, cover = f.cover, west = f.west, south = f.south, east = f.east, north = f.north,
    updated_at = now()
  where id = p_id;
end $$;

-- Uses, remixes, likes and reports. Three reports hide a story until someone reviews it
-- (set hidden = false and reports = 0 in the table editor to restore it).
create or replace function public.bump(p_id uuid, p_what text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_what = 'use' then update public.stories set uses = uses + 1 where id = p_id;
  elsif p_what = 'remix' then update public.stories set remixes = remixes + 1 where id = p_id;
  elsif p_what = 'like' then update public.stories set likes = likes + 1 where id = p_id;
  elsif p_what = 'report' then update public.stories set reports = reports + 1, hidden = (reports + 1 >= 3) where id = p_id;
  end if;
end $$;

revoke all on function public.publish_story(jsonb, text), public.update_story(uuid, text, jsonb), public.bump(uuid, text), public.story_fields(jsonb) from public;
grant execute on function public.publish_story(jsonb, text), public.update_story(uuid, text, jsonb), public.bump(uuid, text) to anon, authenticated;
