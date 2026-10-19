-- WORLD GP — bezpieczne lobby multiplayer (Supabase f1-padok).
--
-- Zasady:
--   * tabele gry leżą w schemacie `game`, którego PostgREST nie wystawia; RLS włączone, jawne „deny all”,
--     zero grantów dla anon/authenticated — jedyną drogą do danych są funkcje RPC poniżej;
--   * gracz to anonimowy użytkownik Supabase Auth (signInAnonymously): bez e-maila i hasła, ale z JWT,
--     dzięki czemu działają prywatne kanały Realtime z RLS na realtime.messages;
--   * IP jest odczytywane po stronie serwera z nagłówka żądania, nigdy nie wraca do klienta i jest kasowane,
--     gdy gracz wychodzi albo przestaje odpowiadać (najpóźniej ok. 3 min), a całe lobby — 30 min po końcu;
--   * kanał lobby `mgp-room-KOD` mogą czytać i pisać wyłącznie aktualni członkowie lobby.
--
-- Uruchom całość jednym wykonaniem (SQL Editor albo `supabase db push`); skrypt jest idempotentny.
-- Kolejność wdrożenia: ta migracja → nowa wersja gry → wyłączenie „Allow public access” w Realtime Settings.

-- ============================================================================================
-- 0. Twardsze uprawnienia domyślne: nowe obiekty w `public` nie dostają już automatycznie ALL dla anon/authenticated
-- ============================================================================================
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from public, anon, authenticated;

-- istniejące tabele serwisu: zostaje tylko SELECT (pod politykami), bez TRIGGER/REFERENCES i bez zapisu
revoke insert, update, delete, truncate, trigger, references on all tables in schema public from anon, authenticated;
-- funkcje w `private` (cron, throttling pytań) nie są potrzebne rolom klienckim
revoke execute on all functions in schema private from public, anon, authenticated;

-- ============================================================================================
-- 1. Schemat i tabele gry
-- ============================================================================================
create schema if not exists game;
revoke all on schema game from public, anon, authenticated;
-- USAGE tylko po to, by polityka Realtime mogła wywołać game.can_use_topic(); tabele i tak nie mają grantów
grant usage on schema game to authenticated;

create table if not exists game.lobbies (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{5}$'),
  name        text not null check (char_length(name) between 1 and 32),
  host_id     uuid not null references auth.users (id) on delete cascade,
  is_private  boolean not null default false,
  max_players smallint not null default 8 check (max_players between 2 and 10),
  status      text not null default 'lobby' check (status in ('lobby', 'quali', 'race', 'results', 'closed')),
  info        jsonb not null default '{}'::jsonb check (jsonb_typeof(info) = 'object' and pg_column_size(info) <= 512),
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  closed_at   timestamptz
);
create index if not exists lobbies_open_idx on game.lobbies (created_at desc) where closed_at is null;
create index if not exists lobbies_host_idx on game.lobbies (host_id) where closed_at is null;
create index if not exists lobbies_closed_idx on game.lobbies (closed_at) where closed_at is not null;

create table if not exists game.lobby_players (
  lobby_id  uuid not null references game.lobbies (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  nick      text not null check (char_length(nick) between 1 and 24),
  kicked    boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  left_at   timestamptz,
  primary key (lobby_id, user_id)
);
create index if not exists lobby_players_user_idx on game.lobby_players (user_id) where left_at is null;
create index if not exists lobby_players_active_idx on game.lobby_players (last_seen) where left_at is null;

-- IP osobno: łatwo skasować, łatwo sprawdzić, że nic poza funkcjami SECURITY DEFINER jej nie dotyka
create table if not exists game.player_ips (
  lobby_id uuid not null,
  user_id  uuid not null,
  ip       inet not null,
  seen_at  timestamptz not null default now(),
  primary key (lobby_id, user_id),
  foreign key (lobby_id, user_id) references game.lobby_players (lobby_id, user_id) on delete cascade
);

-- limity żądań: klucz to IP albo id użytkownika; wpisy żyją najwyżej godzinę
create table if not exists game.rate_limits (
  k            text not null,
  action       text not null,
  window_start timestamptz not null,
  hits         integer not null default 1,
  primary key (k, action, window_start)
);
create index if not exists rate_limits_window_idx on game.rate_limits (window_start);

-- ============================================================================================
-- 2. RLS: wszystko zablokowane
-- ============================================================================================
alter table game.lobbies       enable row level security;
alter table game.lobby_players enable row level security;
alter table game.player_ips    enable row level security;
alter table game.rate_limits   enable row level security;

drop policy if exists deny_all on game.lobbies;
drop policy if exists deny_all on game.lobby_players;
drop policy if exists deny_all on game.player_ips;
drop policy if exists deny_all on game.rate_limits;
create policy deny_all on game.lobbies       as restrictive for all to public using (false) with check (false);
create policy deny_all on game.lobby_players as restrictive for all to public using (false) with check (false);
create policy deny_all on game.player_ips    as restrictive for all to public using (false) with check (false);
create policy deny_all on game.rate_limits   as restrictive for all to public using (false) with check (false);

revoke all on all tables in schema game from public, anon, authenticated;
revoke all on all sequences in schema game from public, anon, authenticated;
alter default privileges for role postgres in schema game revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema game revoke all on functions from public, anon, authenticated;

-- ============================================================================================
-- 3. Funkcje pomocnicze (schemat `game`, niewystawiony przez API)
-- ============================================================================================

-- IP klienta z nagłówków PostgREST; zły format → null (nigdy błąd)
create or replace function game.client_ip()
returns inet
language plpgsql
stable
set search_path = ''
as $$
declare
  h json;
  v text;
begin
  h := nullif(current_setting('request.headers', true), '')::json;
  v := coalesce(nullif(split_part(h ->> 'x-forwarded-for', ',', 1), ''), h ->> 'cf-connecting-ip');
  return nullif(btrim(v), '')::inet;
exception when others then
  return null;
end;
$$;

-- tekst od gracza: NFC, bez znaków sterujących i niewidocznych (zero-width, bidi), przycięty
create or replace function game.clean_text(p text, max_len int)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(btrim(regexp_replace(normalize(coalesce(p, ''), nfc),
    '[[:cntrl:]\u00AD\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]', '', 'g')), max_len), '');
$$;

-- ustawienia lobby widoczne na liście: tylko znane klucze, krótkie wartości
create or replace function game.clean_info(p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p) = 'object' then jsonb_strip_nulls(jsonb_build_object(
    'tr',   case when jsonb_typeof(p -> 'tr') = 'string' then game.clean_text(p ->> 'tr', 24) end,
    'laps', case when jsonb_typeof(p -> 'laps') = 'number' then least(greatest((p ->> 'laps')::numeric, 1), 999)::int end,
    'w',    case when jsonb_typeof(p -> 'w') = 'string' then game.clean_text(p ->> 'w', 12) end,
    'q',    case when jsonb_typeof(p -> 'q') = 'string' then game.clean_text(p ->> 'q', 12) end
  )) else '{}'::jsonb end;
$$;

create or replace function game.require_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  return uid;
end;
$$;

-- okno stałe: p_limit żądań na p_window; klucz IP (gdy znane) albo użytkownik
create or replace function game.throttle(p_action text, p_limit int, p_window interval, p_by_ip boolean default true)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_key text;
  w timestamptz := date_bin(p_window, now(), timestamptz '2000-01-01 00:00:00+00');
  n int;
begin
  v_key := case when p_by_ip then 'ip:' || host(game.client_ip()) end;
  v_key := coalesce(v_key, 'uid:' || auth.uid()::text, 'anon');
  insert into game.rate_limits as r (k, action, window_start, hits)
  values (v_key, p_action, w, 1)
  on conflict on constraint rate_limits_pkey do update set hits = r.hits + 1
  returning r.hits into n;
  if n > p_limit then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
end;
$$;

-- polityka Realtime: kanał `mgp-room-KOD` tylko dla aktualnych członków otwartego lobby
create or replace function game.can_use_topic(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_topic ~ '^mgp-room-[A-HJ-NP-Z2-9]{5}$' and exists (
    select 1
    from game.lobbies l
    join game.lobby_players p on p.lobby_id = l.id
    where l.code = substr(p_topic, 10)
      and l.closed_at is null
      and p.user_id = (select auth.uid())
      and p.left_at is null
      and not p.kicked
  );
$$;

-- ============================================================================================
-- 4. API dla gry (RPC w `public`, tylko dla roli authenticated = anonimowy gracz z JWT)
-- ============================================================================================

-- utworzenie lobby; kod generuje serwer (kryptograficzny los), poprzednie lobby tego hosta jest zamykane.
-- Wynik: {"code": "ABCDE"} albo {"error": "server_full"}.
create or replace function public.lobby_create(p_nick text, p_name text default null, p_private boolean default false,
                                               p_max int default 8, p_info jsonb default '{}'::jsonb)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid    uuid := game.require_uid();
  v_nick text := game.clean_text(p_nick, 24);
  v_name text;
  v_code text;
  v_id   uuid;
  v_ip   inet := game.client_ip();
  b      bytea;
  abc    constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if v_nick is null then
    raise exception 'invalid_nick' using errcode = '22023';
  end if;
  perform game.throttle('create', 6, interval '10 minutes');
  if (select count(*) from game.lobbies where closed_at is null) >= 500 then
    return json_build_object('error', 'server_full');
  end if;
  v_name := coalesce(game.clean_text(p_name, 32), left(v_nick || ' — lobby', 32));

  -- jeden otwarty pokój na hosta
  update game.lobbies set closed_at = now(), status = 'closed' where host_id = uid and closed_at is null;
  update game.lobby_players set left_at = now() where user_id = uid and left_at is null;

  for attempt in 1 .. 8 loop
    b := extensions.gen_random_bytes(5);
    v_code := '';
    for i in 0 .. 4 loop
      v_code := v_code || substr(abc, get_byte(b, i) % 32 + 1, 1);
    end loop;
    begin
      insert into game.lobbies (code, name, host_id, is_private, max_players, info)
      values (v_code, v_name, uid, coalesce(p_private, false), least(greatest(coalesce(p_max, 8), 2), 10), game.clean_info(p_info))
      returning id into v_id;
      exit;
    exception when unique_violation then
      v_id := null;
    end;
  end loop;
  if v_id is null then
    return json_build_object('error', 'server_full');
  end if;

  insert into game.lobby_players (lobby_id, user_id, nick) values (v_id, uid, v_nick);
  if v_ip is not null then
    insert into game.player_ips (lobby_id, user_id, ip) values (v_id, uid, v_ip);
  end if;
  return json_build_object('code', v_code);
end;
$$;

-- dołączenie kodem; limit prób na IP utrudnia zgadywanie kodów prywatnych lobby.
-- Błędy biznesowe wracają jako {"error": ...} zamiast wyjątku: wyjątek wycofałby też licznik prób,
-- a wtedy nieudane zgadywanie kodu nigdy nie trafiłoby na limit.
create or replace function public.lobby_join(p_code text, p_nick text)
returns json
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid    uuid := game.require_uid();
  v_nick text := game.clean_text(p_nick, 24);
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_ip   inet := game.client_ip();
  l      game.lobbies;
  pl     game.lobby_players;
begin
  if v_nick is null then
    raise exception 'invalid_nick' using errcode = '22023';
  end if;
  perform game.throttle('join', 30, interval '10 minutes');

  select * into l from game.lobbies where code = v_code and closed_at is null for update;
  if not found then
    return json_build_object('error', 'lobby_not_found');
  end if;

  select * into pl from game.lobby_players where lobby_id = l.id and user_id = uid;
  if found and pl.kicked then
    return json_build_object('error', 'kicked');
  end if;
  if not found or pl.left_at is not null then
    if l.status <> 'lobby' then
      return json_build_object('error', 'lobby_started');
    end if;
    if (select count(*) from game.lobby_players where lobby_id = l.id and left_at is null) >= l.max_players then
      return json_build_object('error', 'lobby_full');
    end if;
  end if;

  insert into game.lobby_players as p (lobby_id, user_id, nick)
  values (l.id, uid, v_nick)
  on conflict (lobby_id, user_id) do update set nick = excluded.nick, left_at = null, last_seen = now();
  if v_ip is not null then
    insert into game.player_ips as i (lobby_id, user_id, ip)
    values (l.id, uid, v_ip)
    on conflict (lobby_id, user_id) do update set ip = excluded.ip, seen_at = now();
  end if;
  return json_build_object('code', l.code, 'name', l.name, 'max', l.max_players);
end;
$$;

-- sygnał życia (co ok. 20 s); host podtrzymuje też samo lobby
create or replace function public.lobby_ping(p_code text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := game.require_uid();
  l   game.lobbies;
begin
  perform game.throttle('ping', 20, interval '1 minute', false);
  select * into l from game.lobbies where code = upper(p_code) and closed_at is null;
  if not found then
    raise exception 'lobby_not_found' using errcode = 'P0002';
  end if;
  update game.lobby_players set last_seen = now()
  where lobby_id = l.id and user_id = uid and left_at is null and not kicked;
  if not found then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if l.host_id = uid then
    update game.lobbies set last_seen = now() where id = l.id;
  end if;
end;
$$;

-- host: stan i ustawienia lobby widoczne na liście
create or replace function public.lobby_update(p_code text, p_status text default null, p_private boolean default null,
                                               p_max int default null, p_info jsonb default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := game.require_uid();
begin
  perform game.throttle('update', 120, interval '10 minutes', false);
  if p_status is not null and p_status not in ('lobby', 'quali', 'race', 'results') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  update game.lobbies set
    status      = coalesce(p_status, status),
    is_private  = coalesce(p_private, is_private),
    max_players = case when p_max is null then max_players else least(greatest(p_max, 2), 10) end,
    info        = case when p_info is null then info else game.clean_info(p_info) end,
    last_seen   = now()
  where code = upper(p_code) and host_id = uid and closed_at is null;
  if not found then
    raise exception 'not_host' using errcode = '42501';
  end if;
end;
$$;

-- wyjście z lobby: IP kasowane od razu; wyjście hosta zamyka lobby i kasuje IP wszystkich
create or replace function public.lobby_leave(p_code text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := game.require_uid();
  l   game.lobbies;
begin
  select * into l from game.lobbies where code = upper(p_code) and closed_at is null;
  if not found then
    return;
  end if;
  if l.host_id = uid then
    update game.lobbies set closed_at = now(), status = 'closed' where id = l.id;
    update game.lobby_players set left_at = now() where lobby_id = l.id and left_at is null;
    delete from game.player_ips where lobby_id = l.id;
  else
    update game.lobby_players set left_at = now() where lobby_id = l.id and user_id = uid and left_at is null;
    delete from game.player_ips where lobby_id = l.id and user_id = uid;
  end if;
end;
$$;

-- host: usunięcie gracza (traci dostęp do kanału przy następnym dołączeniu i nie wróci do tego lobby)
create or replace function public.lobby_kick(p_code text, p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := game.require_uid();
  l   game.lobbies;
begin
  select * into l from game.lobbies where code = upper(p_code) and host_id = uid and closed_at is null;
  if not found then
    raise exception 'not_host' using errcode = '42501';
  end if;
  if p_user = uid then
    return;
  end if;
  update game.lobby_players set kicked = true, left_at = now() where lobby_id = l.id and user_id = p_user;
  delete from game.player_ips where lobby_id = l.id and user_id = p_user;
end;
$$;

-- lista publicznych, żywych lobby: bez id, bez IP, najwyżej 50 pozycji
create or replace function public.lobby_list()
returns table (code text, name text, host text, n int, max int, st text, info jsonb)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform game.require_uid();
  perform game.throttle('list', 40, interval '1 minute', false);
  return query
    select l.code, l.name, h.nick,
           (select count(*)::int from game.lobby_players p where p.lobby_id = l.id and p.left_at is null),
           l.max_players::int, l.status, l.info
    from game.lobbies l
    left join game.lobby_players h on h.lobby_id = l.id and h.user_id = l.host_id
    where l.closed_at is null
      and not l.is_private
      and l.last_seen > now() - interval '90 seconds'
    order by l.created_at desc
    limit 50;
end;
$$;

revoke all on function public.lobby_create(text, text, boolean, int, jsonb) from public, anon;
revoke all on function public.lobby_join(text, text) from public, anon;
revoke all on function public.lobby_ping(text) from public, anon;
revoke all on function public.lobby_update(text, text, boolean, int, jsonb) from public, anon;
revoke all on function public.lobby_leave(text) from public, anon;
revoke all on function public.lobby_kick(text, uuid) from public, anon;
revoke all on function public.lobby_list() from public, anon;
grant execute on function public.lobby_create(text, text, boolean, int, jsonb) to authenticated;
grant execute on function public.lobby_join(text, text) to authenticated;
grant execute on function public.lobby_ping(text) to authenticated;
grant execute on function public.lobby_update(text, text, boolean, int, jsonb) to authenticated;
grant execute on function public.lobby_leave(text) to authenticated;
grant execute on function public.lobby_kick(text, uuid) to authenticated;
grant execute on function public.lobby_list() to authenticated;

revoke all on all functions in schema game from public, anon, authenticated;
grant execute on function game.can_use_topic(text) to authenticated;

-- ============================================================================================
-- 5. Realtime Authorization: prywatne kanały lobby tylko dla członków
-- ============================================================================================
drop policy if exists "lobby: members receive" on realtime.messages;
drop policy if exists "lobby: members send" on realtime.messages;
create policy "lobby: members receive" on realtime.messages
  for select to authenticated
  using (realtime.messages.extension in ('broadcast', 'presence') and (select game.can_use_topic(realtime.topic())));
create policy "lobby: members send" on realtime.messages
  for insert to authenticated
  with check (realtime.messages.extension in ('broadcast', 'presence') and (select game.can_use_topic(realtime.topic())));

-- ============================================================================================
-- 6. Retencja: sprzątanie co minutę (pg_cron)
-- ============================================================================================
create or replace function game.purge()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- gracze bez sygnału życia od 2 min wychodzą
  update game.lobby_players set left_at = now()
  where left_at is null and last_seen < now() - interval '2 minutes';
  -- lobby bez hosta, z milczącym hostem albo starsze niż 12 h — zamknięte
  update game.lobbies l set closed_at = now(), status = 'closed'
  where l.closed_at is null and (
    l.last_seen < now() - interval '2 minutes'
    or l.created_at < now() - interval '12 hours'
    or not exists (select 1 from game.lobby_players p where p.lobby_id = l.id and p.user_id = l.host_id and p.left_at is null)
  );
  update game.lobby_players p set left_at = now()
  from game.lobbies l
  where l.id = p.lobby_id and l.closed_at is not null and p.left_at is null;
  -- IP tylko na czas obecności w lobby
  delete from game.player_ips i
  using game.lobby_players p
  where p.lobby_id = i.lobby_id and p.user_id = i.user_id and p.left_at is not null;
  -- zamknięte lobby (nicki, stan) — 30 min po końcu
  delete from game.lobbies where closed_at < now() - interval '30 minutes';
  delete from game.rate_limits where window_start < now() - interval '1 hour';
  -- anonimowi użytkownicy Auth bez aktywnego lobby po 2 h (kaskadowo znikają ich sesje z IP i user-agentem)
  delete from auth.users u
  where u.is_anonymous
    and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '2 hours'
    and not exists (select 1 from game.lobby_players p where p.user_id = u.id and p.left_at is null);
  -- dziennik audytu Auth zapisuje IP — trzymamy go najwyżej godzinę
  delete from auth.audit_log_entries where created_at < now() - interval '1 hour';
  -- historia uruchomień cron (co minutę rośnie) — doba
  delete from cron.job_run_details where end_time < now() - interval '1 day';
end;
$$;
revoke all on function game.purge() from public, anon, authenticated;

select cron.schedule('game-purge', '* * * * *', 'select game.purge()');
