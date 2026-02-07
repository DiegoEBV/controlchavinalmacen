create table profiles (
  id uuid references auth.users not null,
  email text,
  role text check (role in ('admin', 'produccion', 'coordinador', 'logistica', 'almacenero', 'sin_asignar')),
  nombre text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (id)
);

-- Set up Row Level Security (RLS)
alter table profiles enable row level security;

create policy "Public profiles are viewable by everyone."
  on profiles for select
  using ( true );

create policy "Users can insert their own profile."
  on profiles for insert
  with check ( auth.uid() = id );

create policy "Users can update own profile."
  on profiles for update
  using ( auth.uid() = id );

-- Create a trigger to automatically create a profile entry when a new user signs up via Supabase Auth.
-- This is a common pattern to sync auth.users with public.profiles
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, email, role, nombre)
  values (new.id, new.email, 'sin_asignar', new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
