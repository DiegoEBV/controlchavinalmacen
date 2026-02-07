-- Fix RLS Policies to allow Admins to update any profile

-- 1. Drop the restrictive update policy if it exists (optional, or we can just add a new one)
-- The existing policy was: create policy "Users can update own profile." on profiles for update using ( auth.uid() = id );
-- We want to keep that so users can update their own names, but we need another one for Admins.

-- 2. Create a policy for Admins
create policy "Admins can update any profile"
  on profiles
  for update
  using (
    auth.uid() in (
      select id from profiles where role = 'admin'
    )
  );

-- Note: This requires the user executing the update to look up their own role in the profiles table.
-- Since we have "Public profiles are viewable by everyone" (select policy = true), this nested select will work.
