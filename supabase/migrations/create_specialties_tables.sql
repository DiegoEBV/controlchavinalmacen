-- 1. Create Specialties Master Table
CREATE TABLE IF NOT EXISTS specialties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    active BOOLEAN DEFAULT true, -- Soft Delete support
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure 'active' column exists (for existing tables)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'specialties' AND column_name = 'active') THEN
        ALTER TABLE specialties ADD COLUMN active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- 2. Create Intermediate Table (Front <-> Specialty)
CREATE TABLE IF NOT EXISTS front_specialties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    front_id UUID NOT NULL REFERENCES frentes(id) ON DELETE CASCADE,
    specialty_id UUID NOT NULL REFERENCES specialties(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(front_id, specialty_id) -- Prevent duplicate assignments
);

-- 3. Add specialty_id to Materials Table
ALTER TABLE materiales
ADD COLUMN IF NOT EXISTS specialty_id UUID REFERENCES specialties(id) ON DELETE SET NULL;

-- 4. Enable RLS
ALTER TABLE specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE front_specialties ENABLE ROW LEVEL SECURITY;

-- 5. Policies
-- Specialties: View all (or just active? Usually admins see all, users see active)
DROP POLICY IF EXISTS "Allow read access for authenticated users" ON specialties;
CREATE POLICY "Allow read access for authenticated users" ON specialties
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert/update/delete for authenticated users" ON specialties;
CREATE POLICY "Allow insert/update/delete for authenticated users" ON specialties
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Front Specialties
DROP POLICY IF EXISTS "Allow read access for authenticated users" ON front_specialties;
CREATE POLICY "Allow read access for authenticated users" ON front_specialties
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert/update/delete for authenticated users" ON front_specialties;
CREATE POLICY "Allow insert/update/delete for authenticated users" ON front_specialties
    FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- 6. MIGRATION LOGIC (Run this once)
DO $$
DECLARE
    general_spec_id UUID;
BEGIN
    -- Check if 'General' specialty exists, if not create it
    SELECT id INTO general_spec_id FROM specialties WHERE name = 'General';
    
    IF general_spec_id IS NULL THEN
        INSERT INTO specialties (name, description, active)
        VALUES ('General', 'Especialidad por defecto para materiales existentes', true)
        RETURNING id INTO general_spec_id;
    END IF;

    -- Update existing materials that have NULL specialty_id
    UPDATE materiales
    SET specialty_id = general_spec_id
    WHERE specialty_id IS NULL;

    -- Optional: If you want to link this General specialty to ALL existing fronts so they show up:
    INSERT INTO front_specialties (front_id, specialty_id)
    SELECT f.id, general_spec_id
    FROM frentes f
    WHERE NOT EXISTS (
        SELECT 1 FROM front_specialties fs 
        WHERE fs.front_id = f.id AND fs.specialty_id = general_spec_id
    );
END $$;
