-- 1. Create Storage Bucket 'formatos-obras'
-- Note: Buckets are usually created via the Supabase Dashboard or API, but we can try to insert into storage.buckets if permissions allow.
-- Ideally, create the bucket "formatos-obras" in the Storage section of the Dashboard and make it PUBLIC.

INSERT INTO storage.buckets (id, name, public)
VALUES ('formatos-obras', 'formatos-obras', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Add columns to 'obras' table
ALTER TABLE obras 
ADD COLUMN IF NOT EXISTS formato_requerimiento_url TEXT,
ADD COLUMN IF NOT EXISTS formato_solicitud_url TEXT;

-- 3. Set up RLS Policies for Storage
-- Allow Public Read Access
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'formatos-obras' );

-- Allow Authenticated Upload
CREATE POLICY "Authenticated Upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'formatos-obras' );

-- Allow Authenticated Update
CREATE POLICY "Authenticated Update"
ON storage.objects FOR UPDATE
TO authenticated
USING ( bucket_id = 'formatos-obras' );

-- Allow Authenticated Delete
CREATE POLICY "Authenticated Delete"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'formatos-obras' );
