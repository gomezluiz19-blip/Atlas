-- Hotel Yaluma: aviso por WhatsApp al dueño cuando llega una solicitud del sitio web.
--
-- Cómo usarlo (después de schema.sql):
--   1. Consiga su clave gratis de CallMeBot (ver README, "Avisos por WhatsApp").
--   2. En Supabase abra "SQL Editor", pegue TODO este archivo y presione "Run".
--   3. Agregue su número y su clave con la línea del final (quítele los "--").
--
-- La clave queda en un esquema privado: el sitio web y el personal no la pueden leer.
-- Se puede volver a ejecutar sin problema.

-- pg_net permite que la base de datos haga la llamada a CallMeBot por su cuenta.
create extension if not exists pg_net with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

-- A quién avisar. Un número por fila (puede agregar más, ej. el del hotel).
create table if not exists private.avisos_whatsapp (
  phone text primary key, -- con + y código de país, ej. '+13479159888'
  apikey text not null,   -- la clave que CallMeBot le envía a ese número
  active boolean not null default true
);

create or replace function private.avisar_nueva_reserva() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare
  dest record;
  recientes int;
  tz constant text := 'America/Santo_Domingo';
  habitacion text;
  detalle text;
  msg text;
begin
  if new.source <> 'web' then
    return new;
  end if;

  -- Freno contra abusos: máximo 30 avisos por hora.
  select count(*) into recientes from public.reservations
  where source = 'web' and created_at > now() - interval '1 hour';
  if recientes > 30 then
    return new;
  end if;

  -- Los mismos nombres que en config.js. Si cambian allí, cámbielos aquí.
  habitacion := case new.room_tier
    when 'estandar' then 'Regular'
    when 'premium' then 'Premium · 1 cama queen'
    when 'premium2' then 'Premium · 2 camas queen'
    else new.room_tier end;

  detalle := case new.stay_type
    when 'pase' then 'Paso 4 h · ' || to_char(new.pass_start at time zone tz, 'DD/MM HH12:MI AM')
    when 'dia' then 'Noche y día · ' || to_char(new.check_in, 'DD/MM') || ' → ' || to_char(new.check_out, 'DD/MM')
    else 'Noche · ' || to_char(new.check_in, 'DD/MM') || ' → ' || to_char(new.check_out, 'DD/MM')
  end;

  msg := '🔔 Nueva solicitud ' || new.code || E'\n'
    || habitacion || E'\n'
    || detalle || E'\n'
    || 'RD$' || to_char(new.total, 'FM999,999,990') || ' · ' || (new.adults + new.kids) || case when new.adults + new.kids = 1 then ' persona' else ' personas' end || E'\n'
    || new.guest_name || coalesce(' · ' || new.guest_phone, '')
    || coalesce(E'\n' || 'Nota: ' || left(new.notes, 200), '') || E'\n'
    || 'hotelyaluma.com/admin';

  for dest in select phone, apikey from private.avisos_whatsapp where active loop
    begin
      perform net.http_get(
        url := 'https://api.callmebot.com/whatsapp.php',
        params := jsonb_build_object('phone', dest.phone, 'text', msg, 'apikey', dest.apikey)
      );
    exception when others then
      -- Si el aviso falla, la reserva se guarda igual.
      raise warning 'No se pudo avisar a %: %', dest.phone, sqlerrm;
    end;
  end loop;

  return new;
end $$;

revoke all on function private.avisar_nueva_reserva() from public, anon, authenticated;

drop trigger if exists avisar_nueva_reserva on public.reservations;
create trigger avisar_nueva_reserva after insert on public.reservations
  for each row execute function private.avisar_nueva_reserva();

-- Paso 3: ponga aquí la clave que le mandó CallMeBot y ejecute esta línea (sin los "--"):
-- insert into private.avisos_whatsapp (phone, apikey) values ('+13479159888', 'SU_CLAVE') on conflict (phone) do update set apikey = excluded.apikey, active = true;

-- Para dejar de recibir avisos en un número:
-- update private.avisos_whatsapp set active = false where phone = '+13479159888';
