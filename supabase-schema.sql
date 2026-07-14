-- Habilitar extensión para UUIDs
extension if not exists "uuid-ossp";

-- Tabla de perfiles de usuario (extiende auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  avatar_initials text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Tabla de progreso general del usuario
create table public.user_progress (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles on delete cascade not null,
  current_level integer default 1,
  current_lesson integer default 1,
  lesson_progress jsonb default '{}'::jsonb, -- {lesson_id: progress_percentage}
  total_signs_learned integer default 0,
  total_practice_time integer default 0, -- en minutos
  average_accuracy float default 0,
  streak_days integer default 0,
  last_practice_date timestamp with time zone,
  weekly_activity jsonb default '[]'::jsonb, -- array de 16 semanas x 7 días
  daily_quests jsonb default '[]'::jsonb, -- retos diarios completados
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id)
);

-- Tabla de progreso por módulo
create table public.module_progress (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles on delete cascade not null,
  module_id text not null,
  status text default 'locked' check (status in ('current', 'completed', 'locked')),
  signs_completed integer default 0,
  total_signs integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_id, module_id)
);

-- Tabla de práctica individual de señas
create table public.sign_practice (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles on delete cascade not null,
  sign_name text not null,
  module text not null,
  accuracy float not null,
  practice_date timestamp with time zone default timezone('utc'::text, now()) not null,
  time_spent integer default 0 -- en segundos
);

-- Trigger para actualizar updated_at
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

-- Aplicar trigger a las tablas
create trigger on_profiles_updated before update on public.profiles
  for each row execute procedure public.handle_updated_at();

create trigger on_user_progress_updated before update on public.user_progress
  for each row execute procedure public.handle_updated_at();

create trigger on_module_progress_updated before update on public.module_progress
  for each row execute procedure public.handle_updated_at();

-- Trigger para crear perfil automáticamente cuando se crea un usuario en auth.users
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, avatar_initials)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    substring(coalesce(new.raw_user_meta_data->>'full_name', '') from 1 for 2)
  );
  
  insert into public.user_progress (user_id)
  values (new.id);
  
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.user_progress enable row level security;
alter table public.module_progress enable row level security;
alter table public.sign_practice enable row level security;

-- Políticas RLS para profiles
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Políticas RLS para user_progress
create policy "Users can view own progress"
  on public.user_progress for select
  using (auth.uid() = user_id);

create policy "Users can update own progress"
  on public.user_progress for update
  using (auth.uid() = user_id);

create policy "Users can insert own progress"
  on public.user_progress for insert
  with check (auth.uid() = user_id);

-- Políticas RLS para module_progress
create policy "Users can view own module progress"
  on public.module_progress for select
  using (auth.uid() = user_id);

create policy "Users can update own module progress"
  on public.module_progress for update
  using (auth.uid() = user_id);

create policy "Users can insert own module progress"
  on public.module_progress for insert
  with check (auth.uid() = user_id);

-- Políticas RLS para sign_practice
create policy "Users can view own practice"
  on public.sign_practice for select
  using (auth.uid() = user_id);

create policy "Users can insert own practice"
  on public.sign_practice for insert
  with check (auth.uid() = user_id);

-- Índices para mejor rendimiento
create index profiles_id_idx on public.profiles(id);
create index user_progress_user_id_idx on public.user_progress(user_id);
create index module_progress_user_id_idx on public.module_progress(user_id);
create index module_progress_module_id_idx on public.module_progress(module_id);
create index sign_practice_user_id_idx on public.sign_practice(user_id);
create index sign_practice_sign_name_idx on public.sign_practice(sign_name);
