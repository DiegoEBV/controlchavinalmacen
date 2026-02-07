-- OPTIONAL: Drop old objects if you want a clean slate (CAREFUL: DELETES DATA)
-- drop table if exists profiles cascade;

-- 1. Update the Constraint to allow 'sin_asignar'
-- (If you are running this for the first time, just use the create table block below with the correct check)
-- If the table ALREADY exists, run this:
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check 
  check (role in ('admin', 'produccion', 'coordinador', 'logistica', 'almacenero', 'sin_asignar'));

-- 2. Update the Trigger Function to use 'sin_asignar' instead of 'básico'
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, email, role, nombre)
  values (new.id, new.email, 'sin_asignar', new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

-- 3. (Reference) The full Create Table if you haven't created it yet:
/*
create table profiles (
  id uuid references auth.users not null,
  email text,
  role text check (role in ('admin', 'produccion', 'coordinador', 'logistica', 'almacenero', 'sin_asignar')),
  nombre text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (id)
);
-- Enable RLS and Policies as before...
*/
