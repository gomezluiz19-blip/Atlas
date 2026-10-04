-- Team workspaces for the Pro tools (Education Pro, Construction Pro, City Ops, and any tool that keeps one
-- document of state). Run after backend.sql. A workspace is one shared document with members in three roles:
--   owner   manages members, edits, deletes the workspace
--   editor  edits
--   viewer  reads
-- Every save bumps a version; a save from an out-of-date copy is refused (optimistic concurrency), and every
-- earlier version is kept in workspace_history so it can be restored.

create table if not exists workspaces (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null,                       -- the tool's store key, e.g. 'atlas.pro.city.v1'
  name       text not null check (char_length(name) between 1 and 120),
  owner      uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists workspace_members (
  workspace_id uuid not null references workspaces on delete cascade,
  email        text not null check (position('@' in email) > 1),
  user_id      uuid references auth.users on delete cascade,   -- null until the invited person signs in
  role         text not null check (role in ('owner', 'editor', 'viewer')),
  added_at     timestamptz not null default now(),
  primary key (workspace_id, email)
);
create index if not exists workspace_members_user on workspace_members (user_id);

create table if not exists workspace_docs (
  workspace_id uuid primary key references workspaces on delete cascade,
  body         jsonb not null,
  version      integer not null default 1,
  updated_by   uuid default auth.uid(),
  updated_at   timestamptz not null default now()
);

create table if not exists workspace_history (
  id           bigserial primary key,
  workspace_id uuid not null references workspaces on delete cascade,
  version      integer not null,
  body         jsonb not null,
  updated_by   uuid,
  updated_at   timestamptz not null
);
create index if not exists workspace_history_ws on workspace_history (workspace_id, version desc);

-- The signed-in person's role in a workspace (null if none). Security definer so policies can use it
-- without recursing into workspace_members' own policies.
create or replace function ws_role(ws uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from workspace_members where workspace_id = ws and user_id = auth.uid()
$$;

-- Invitations are by email; when the invited person signs in, this links them to their memberships.
create or replace function claim_invites() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update workspace_members set user_id = auth.uid()
   where user_id is null and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''));
  get diagnostics n = row_count;
  return n;
end $$;

-- The creator becomes the owner member.
create or replace function ws_add_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into workspace_members (workspace_id, email, user_id, role)
  values (new.id, lower(coalesce(auth.jwt() ->> 'email', new.owner::text || '@owner')), new.owner, 'owner');
  return new;
end $$;
drop trigger if exists ws_add_owner on workspaces;
create trigger ws_add_owner after insert on workspaces for each row execute function ws_add_owner();

-- Saves must come from the latest version (version = old + 1); the old version goes to history.
create or replace function ws_doc_versioned() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.version <> old.version + 1 then
    raise exception 'stale: workspace was saved by someone else (version %)', old.version using errcode = '40001';
  end if;
  insert into workspace_history (workspace_id, version, body, updated_by, updated_at)
  values (old.workspace_id, old.version, old.body, old.updated_by, old.updated_at);
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists ws_doc_versioned on workspace_docs;
create trigger ws_doc_versioned before update on workspace_docs for each row execute function ws_doc_versioned();

-- Keep history bounded: the latest 200 versions per workspace.
create or replace function ws_trim_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from workspace_history h
   where h.workspace_id = new.workspace_id
     and h.id not in (select id from workspace_history where workspace_id = new.workspace_id order by version desc limit 200);
  return null;
end $$;
drop trigger if exists ws_trim_history on workspace_history;
create trigger ws_trim_history after insert on workspace_history for each row execute function ws_trim_history();

alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table workspace_docs enable row level security;
alter table workspace_history enable row level security;

create policy "members read" on workspaces for select using (ws_role(id) is not null);
create policy "anyone signed in creates" on workspaces for insert with check (owner = auth.uid());
create policy "owner renames" on workspaces for update using (ws_role(id) = 'owner');
create policy "owner deletes" on workspaces for delete using (ws_role(id) = 'owner');

create policy "members see members" on workspace_members for select using (ws_role(workspace_id) is not null);
create policy "owner invites" on workspace_members for insert with check (ws_role(workspace_id) = 'owner');
create policy "owner changes roles" on workspace_members for update using (ws_role(workspace_id) = 'owner');
create policy "owner removes, anyone leaves" on workspace_members for delete using (ws_role(workspace_id) = 'owner' or user_id = auth.uid());

create policy "members read the doc" on workspace_docs for select using (ws_role(workspace_id) is not null);
create policy "editors create the doc" on workspace_docs for insert with check (ws_role(workspace_id) in ('owner', 'editor'));
create policy "editors save" on workspace_docs for update using (ws_role(workspace_id) in ('owner', 'editor'));

create policy "members read history" on workspace_history for select using (ws_role(workspace_id) is not null);
