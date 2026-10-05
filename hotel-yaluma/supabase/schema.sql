-- Hotel Yaluma: base de datos del panel del personal.
--
-- Cómo usarlo: en Supabase abra "SQL Editor", pegue TODO este archivo y
-- presione "Run". Se puede volver a ejecutar sin perder datos.
--
-- Reglas de acceso:
--   * El sitio público solo puede CREAR solicitudes de reserva (no puede leer nada).
--   * El personal activo puede ver y manejar habitaciones, reservas y turnos.
--   * Solo el administrador (dueño) puede activar cuentas y cambiar roles.
--   * La primera cuenta que se cree será el administrador.

-- ------------------------------------------------------------------ tablas

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  name text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.rooms (
  number text primary key,
  tier text not null,
  floor int not null default 1,
  state text not null default 'ok' check (state in ('ok', 'limpieza', 'fuera')),
  note text
);

create table if not exists public.reservations (
  id bigint generated always as identity primary key,
  code text not null,
  source text not null default 'web' check (source in ('web', 'telefono', 'llegada')),
  stay_type text not null check (stay_type in ('noche', 'pase')),
  room_tier text not null,
  room_number text references public.rooms (number),
  guest_name text not null,
  guest_phone text,
  guest_email text,
  adults int not null default 1,
  kids int not null default 0,
  check_in date not null,
  check_out date,
  pass_start timestamptz,
  pass_end timestamptz,
  arrival text,
  notes text,
  lang text,
  total numeric not null default 0,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'confirmada', 'en_curso', 'completada', 'cancelada', 'no_llego')),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles (id),
  checked_out_at timestamptz,
  checked_out_by uuid references public.profiles (id)
);
create index if not exists reservations_status_idx on public.reservations (status);
create index if not exists reservations_check_in_idx on public.reservations (check_in);

create table if not exists public.payments (
  id bigint generated always as identity primary key,
  reservation_id bigint not null references public.reservations (id),
  amount numeric not null check (amount >= 0),
  at timestamptz not null default now(),
  user_id uuid not null references public.profiles (id)
);

create table if not exists public.shifts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.activity (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid references public.profiles (id),
  text text not null
);

-- ------------------------------------------------------------------ habitaciones
-- EDITAR: si los números reales son otros, cámbielos aquí y en config.js.
insert into public.rooms (number, tier, floor) values
  ('101', 'premium', 1), ('102', 'premium', 1), ('103', 'premium', 1), ('104', 'premium', 1),
  ('105', 'premium', 1), ('106', 'premium', 1), ('107', 'deluxe', 1),
  ('201', 'estandar', 2), ('202', 'estandar', 2), ('203', 'estandar', 2), ('204', 'estandar', 2),
  ('205', 'estandar', 2), ('206', 'estandar', 2), ('207', 'estandar', 2), ('208', 'estandar', 2),
  ('209', 'estandar', 2), ('210', 'estandar', 2), ('211', 'estandar', 2), ('212', 'estandar', 2)
on conflict (number) do nothing;

-- ------------------------------------------------------------------ cuentas nuevas
-- Cada cuenta nueva crea su perfil. La primera queda como administrador activo;
-- las demás quedan inactivas hasta que el administrador las active.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_user boolean;
begin
  select not exists (select 1 from public.profiles) into first_user;
  insert into public.profiles (id, username, name, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    case when first_user then 'admin' else 'staff' end,
    first_user
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------ permisos
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'admin');
$$;

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.reservations enable row level security;
alter table public.payments enable row level security;
alter table public.shifts enable row level security;
alter table public.activity enable row level security;

drop policy if exists "perfil propio o personal" on public.profiles;
create policy "perfil propio o personal" on public.profiles
  for select using (id = auth.uid() or public.is_staff());
drop policy if exists "admin cambia perfiles" on public.profiles;
create policy "admin cambia perfiles" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "personal ve habitaciones" on public.rooms;
create policy "personal ve habitaciones" on public.rooms
  for select using (public.is_staff());
drop policy if exists "personal cambia habitaciones" on public.rooms;
create policy "personal cambia habitaciones" on public.rooms
  for update using (public.is_staff()) with check (public.is_staff());

-- El sitio público solo puede enviar solicitudes nuevas y sin cobro.
drop policy if exists "sitio web envía solicitudes" on public.reservations;
create policy "sitio web envía solicitudes" on public.reservations
  for insert to anon with check (
    source = 'web' and status = 'pendiente' and room_number is null
    and created_by is null and checked_in_at is null and checked_out_at is null
  );
drop policy if exists "personal ve reservas" on public.reservations;
create policy "personal ve reservas" on public.reservations
  for select using (public.is_staff());
drop policy if exists "personal crea reservas" on public.reservations;
create policy "personal crea reservas" on public.reservations
  for insert to authenticated with check (public.is_staff());
drop policy if exists "personal cambia reservas" on public.reservations;
create policy "personal cambia reservas" on public.reservations
  for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists "personal ve cobros" on public.payments;
create policy "personal ve cobros" on public.payments
  for select using (public.is_staff());
drop policy if exists "personal registra cobros" on public.payments;
create policy "personal registra cobros" on public.payments
  for insert with check (public.is_staff() and user_id = auth.uid());

drop policy if exists "personal ve turnos" on public.shifts;
create policy "personal ve turnos" on public.shifts
  for select using (public.is_staff());
drop policy if exists "personal abre su turno" on public.shifts;
create policy "personal abre su turno" on public.shifts
  for insert with check (public.is_staff() and user_id = auth.uid());
drop policy if exists "personal cierra su turno" on public.shifts;
create policy "personal cierra su turno" on public.shifts
  for update using (public.is_staff() and (user_id = auth.uid() or public.is_admin()))
  with check (public.is_staff());

drop policy if exists "personal ve actividad" on public.activity;
create policy "personal ve actividad" on public.activity
  for select using (public.is_staff());
drop policy if exists "personal registra actividad" on public.activity;
create policy "personal registra actividad" on public.activity
  for insert with check (public.is_staff() and user_id = auth.uid());

-- ------------------------------------------------------------------ tiempo real
-- Para que el panel se actualice solo en todos los teléfonos.
do $$
declare t text;
begin
  foreach t in array array['profiles', 'rooms', 'reservations', 'payments', 'shifts', 'activity'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
