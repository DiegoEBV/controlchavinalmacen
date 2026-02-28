-- Create the 'descargas' bucket using the provided helper function (preferred in Supabase)
-- This avoids direct manipulation of the storage.buckets table if possible, although INSERT is usually fine.
INSERT INTO storage.buckets (id, name, public)
VALUES ('descargas', 'descargas', false)
ON CONFLICT (id) DO NOTHING;

-- Policies for the 'descargas' bucket
-- Note: We don't need to 'ENABLE RLS' on storage.objects because it's already enabled by default in Supabase.
-- We just need to define our specific policies.

-- Policy to allow the service role (used by Edge Functions) full access to this specific bucket
CREATE POLICY "Service Role Full Access Descargas" ON storage.objects
FOR ALL TO service_role 
USING (bucket_id = 'descargas')
WITH CHECK (bucket_id = 'descargas');

-- Optional: If you want to allow authenticated users to read their own (or all) exports via signed URLs, 
-- no additional policy is needed for signed URLs as they bypass RLS.

-- If we want the user to be able to download via signed URL, 
-- the signed URL mechanism bypasses standard RLS for the duration of the signature.
