-- 1. Crear tabla de Frentes
CREATE TABLE frentes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    obra_id UUID REFERENCES obras(id) ON DELETE CASCADE,
    nombre_frente TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Agregar columna frente_id a materiales
-- Nota: Inicialmente nullable para no romper datos existentes, 
-- pero idealmente debería poblarse y luego hacerse NOT NULL.
ALTER TABLE materiales 
ADD COLUMN frente_id UUID REFERENCES frentes(id) ON DELETE CASCADE;

-- 3. Agregar columna frente_id a requerimientos
ALTER TABLE requerimientos 
ADD COLUMN frente_id UUID REFERENCES frentes(id) ON DELETE SET NULL;

-- 4. Políticas de Seguridad (RLS) - Ejemplo básico (ajustar según configuración actual)
ALTER TABLE frentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Frentes visibles por todos" ON frentes
    FOR SELECT USING (true);

CREATE POLICY "Frentes editables por autenticados" ON frentes
    FOR ALL USING (auth.role() = 'authenticated');
