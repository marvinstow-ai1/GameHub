-- Game Hub – Schema, RLS, Functions, Realtime
-- =============================================

-- ---------- Profiles ----------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null unique check (char_length(username) between 2 and 24),
  display_name text,
  avatar_hue int not null default floor(random() * 360),
  games_played int not null default 0,
  wins int not null default 0,
  created_at timestamptz not null default now()
);

-- Profil automatisch beim Signup anlegen (Username aus den Auth-Metadaten)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_username text;
begin
  v_username := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    'spieler-' || substr(new.id::text, 1, 6)
  );
  -- bei Kollision Suffix anhängen
  if exists (select 1 from public.profiles where username = v_username) then
    v_username := v_username || '-' || substr(md5(random()::text), 1, 4);
  end if;
  insert into public.profiles (id, username)
  values (new.id, v_username)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Gruppen ----------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  invite_token text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

-- Beitritt per Invite-Link
create or replace function public.join_group_by_token(p_token text)
returns table (group_id uuid, group_name text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_group public.groups%rowtype;
begin
  select * into v_group from public.groups where invite_token = p_token;
  if not found then
    raise exception 'Ungültiger Invite-Link';
  end if;
  insert into public.group_members (group_id, user_id)
  values (v_group.id, auth.uid())
  on conflict do nothing;
  return query select v_group.id, v_group.name;
end;
$$;

-- ---------- Game Sessions ----------
create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  game_id text not null,
  host_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'lobby' check (status in ('lobby', 'running', 'finished')),
  phase text not null default 'LOBBY',
  state jsonb not null default '{}',
  winner_ids uuid[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index game_sessions_group_idx on public.game_sessions (group_id, status);

create table public.session_players (
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  score int not null default 0,
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create or replace function public.is_session_member(p_session_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1
    from public.game_sessions gs
    join public.group_members gm on gm.group_id = gs.group_id
    where gs.id = p_session_id and gm.user_id = auth.uid()
  );
$$;

-- Gartic-Phone-Zeichnungen (zu groß für den Session-State)
create table public.gartic_drawings (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  step int not null,
  chain int not null,
  data text not null,
  created_at timestamptz not null default now()
);

create index gartic_drawings_session_idx on public.gartic_drawings (session_id);

-- Stats nach Spielende (vom Host aufgerufen)
create or replace function public.record_results(p_session_id uuid, p_winner_ids uuid[])
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_session_member(p_session_id) then
    raise exception 'Keine Berechtigung';
  end if;
  update public.profiles
  set games_played = games_played + 1
  where id in (select user_id from public.session_players where session_id = p_session_id);
  update public.profiles
  set wins = wins + 1
  where id = any(p_winner_ids)
    and id in (select user_id from public.session_players where session_id = p_session_id);
end;
$$;

-- ---------- Zufalls-Content für Spiele ----------
create or replace function public.get_random_content(p_table text, p_count int)
returns jsonb
language plpgsql
security definer set search_path = public
stable
as $$
declare
  result jsonb;
begin
  if p_table not in (
    'td_prompts', 'nhie_prompts', 'quiz_questions', 'slf_categories',
    'codenames_words', 'tabu_words', 'whoami_characters', 'bingo_statements',
    'hottake_prompts', 'ranking_prompts', 'gartic_prompts', 'blindtest_songs'
  ) then
    raise exception 'Unbekannte Content-Tabelle';
  end if;
  if p_count < 1 or p_count > 500 then
    raise exception 'Ungültige Anzahl';
  end if;
  execute format(
    'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from %I order by random() limit %s) t',
    p_table, p_count
  ) into result;
  return result;
end;
$$;

-- ---------- Content-Tabellen ----------
create table public.td_prompts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('truth', 'dare')),
  text text not null,
  spice int not null default 1 check (spice between 1 and 3)
);

create table public.nhie_prompts (
  id bigint generated always as identity primary key,
  text text not null,
  spice int not null default 1 check (spice between 1 and 3)
);

create table public.quiz_questions (
  id bigint generated always as identity primary key,
  question text not null,
  options jsonb not null,
  correct int not null check (correct between 0 and 3),
  category text not null,
  difficulty int not null default 1 check (difficulty between 1 and 3)
);

create table public.slf_categories (
  id bigint generated always as identity primary key,
  name text not null unique
);

create table public.codenames_words (
  id bigint generated always as identity primary key,
  word text not null unique
);

create table public.tabu_words (
  id bigint generated always as identity primary key,
  word text not null unique,
  taboo jsonb not null
);

create table public.whoami_characters (
  id bigint generated always as identity primary key,
  name text not null unique,
  category text not null
);

create table public.bingo_statements (
  id bigint generated always as identity primary key,
  text text not null unique
);

create table public.hottake_prompts (
  id bigint generated always as identity primary key,
  text text not null unique
);

create table public.ranking_prompts (
  id bigint generated always as identity primary key,
  text text not null unique
);

create table public.gartic_prompts (
  id bigint generated always as identity primary key,
  text text not null unique
);

create table public.blindtest_songs (
  id bigint generated always as identity primary key,
  title text not null,
  artist text not null,
  category text not null default 'Pop'
);

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.game_sessions enable row level security;
alter table public.session_players enable row level security;
alter table public.gartic_drawings enable row level security;

create policy "profiles lesbar für eingeloggte" on public.profiles
  for select to authenticated using (true);
create policy "eigenes profil anlegen" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "eigenes profil ändern" on public.profiles
  for update to authenticated using (id = auth.uid());

create policy "gruppen sehen mitglieder" on public.groups
  for select to authenticated using (public.is_group_member(id) or owner_id = auth.uid());
create policy "gruppe erstellen" on public.groups
  for insert to authenticated with check (owner_id = auth.uid());
create policy "gruppe ändern owner" on public.groups
  for update to authenticated using (owner_id = auth.uid());
create policy "gruppe löschen owner" on public.groups
  for delete to authenticated using (owner_id = auth.uid());

create policy "mitglieder sehen mitglieder" on public.group_members
  for select to authenticated using (public.is_group_member(group_id));
create policy "selbst beitreten" on public.group_members
  for insert to authenticated with check (user_id = auth.uid());
create policy "selbst verlassen" on public.group_members
  for delete to authenticated using (user_id = auth.uid());

create policy "sessions sehen mitglieder" on public.game_sessions
  for select to authenticated using (public.is_group_member(group_id));
create policy "session erstellen mitglieder" on public.game_sessions
  for insert to authenticated with check (public.is_group_member(group_id) and host_id = auth.uid());
create policy "session updaten mitglieder" on public.game_sessions
  for update to authenticated using (public.is_group_member(group_id));
create policy "session löschen host" on public.game_sessions
  for delete to authenticated using (host_id = auth.uid());

create policy "session players sehen" on public.session_players
  for select to authenticated using (public.is_session_member(session_id));
create policy "selbst in session" on public.session_players
  for insert to authenticated with check (user_id = auth.uid() and public.is_session_member(session_id));
create policy "session player update" on public.session_players
  for update to authenticated using (public.is_session_member(session_id));
create policy "selbst aus session" on public.session_players
  for delete to authenticated using (user_id = auth.uid());

create policy "drawings sehen mitglieder" on public.gartic_drawings
  for select to authenticated using (public.is_session_member(session_id));
create policy "eigene drawings anlegen" on public.gartic_drawings
  for insert to authenticated with check (author_id = auth.uid() and public.is_session_member(session_id));

-- Content-Tabellen: lesbar für alle eingeloggten (Schreiben nur via Service Role)
alter table public.td_prompts enable row level security;
alter table public.nhie_prompts enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.slf_categories enable row level security;
alter table public.codenames_words enable row level security;
alter table public.tabu_words enable row level security;
alter table public.whoami_characters enable row level security;
alter table public.bingo_statements enable row level security;
alter table public.hottake_prompts enable row level security;
alter table public.ranking_prompts enable row level security;
alter table public.gartic_prompts enable row level security;
alter table public.blindtest_songs enable row level security;

create policy "content lesbar" on public.td_prompts for select to authenticated using (true);
create policy "content lesbar" on public.nhie_prompts for select to authenticated using (true);
create policy "content lesbar" on public.quiz_questions for select to authenticated using (true);
create policy "content lesbar" on public.slf_categories for select to authenticated using (true);
create policy "content lesbar" on public.codenames_words for select to authenticated using (true);
create policy "content lesbar" on public.tabu_words for select to authenticated using (true);
create policy "content lesbar" on public.whoami_characters for select to authenticated using (true);
create policy "content lesbar" on public.bingo_statements for select to authenticated using (true);
create policy "content lesbar" on public.hottake_prompts for select to authenticated using (true);
create policy "content lesbar" on public.ranking_prompts for select to authenticated using (true);
create policy "content lesbar" on public.gartic_prompts for select to authenticated using (true);
create policy "content lesbar" on public.blindtest_songs for select to authenticated using (true);

-- ---------- Realtime ----------
alter publication supabase_realtime add table public.game_sessions;
alter publication supabase_realtime add table public.session_players;
alter publication supabase_realtime add table public.group_members;
