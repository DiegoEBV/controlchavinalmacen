-- Add specialty_id column to requerimientos if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'requerimientos' AND column_name = 'specialty_id') THEN
        ALTER TABLE requerimientos ADD COLUMN specialty_id UUID REFERENCES specialties(id);
    END IF;
END $$;

-- Backfill specialty_id based on existing text 'especialidad'
-- Case-insensitive match is safer
UPDATE requerimientos
SET specialty_id = s.id
FROM specialties s
WHERE LOWER(requerimientos.especialidad) = LOWER(s.name)
AND requerimientos.specialty_id IS NULL;

-- Log the migration
SELECT 'Migration completed: specialty_id added and backfilled.' as result;
