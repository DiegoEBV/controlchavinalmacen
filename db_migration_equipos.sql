
-- 0. Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabla de Equipos
CREATE TABLE IF NOT EXISTS equipos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    obra_id UUID NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    codigo TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'Operativo' CHECK (estado IN ('Operativo', 'En Uso', 'Inoperativo', 'En Taller')),
    fecha_adquisicion DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(obra_id, codigo)
);

-- 2. Tabla de Movimientos de Equipos
CREATE TABLE IF NOT EXISTS movimientos_equipos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    equipo_id UUID NOT NULL REFERENCES equipos(id) ON DELETE CASCADE,
    solicitante_id UUID NOT NULL REFERENCES solicitantes(id), -- Persona que retira
    usuario_autoriza_id UUID NOT NULL REFERENCES auth.users(id), -- Storekeeper/Admin
    bloque_destino TEXT NOT NULL,
    fecha_salida TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    fecha_retorno_estimada TIMESTAMP WITH TIME ZONE,
    fecha_retorno_real TIMESTAMP WITH TIME ZONE,
    estado_retorno TEXT,
    evidencia_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2.1 Índice de Rendimiento para pendientes
CREATE INDEX IF NOT EXISTS idx_movimientos_pendientes ON movimientos_equipos (equipo_id) 
WHERE fecha_retorno_real IS NULL;

-- 3. Trigger para actualizar estado a 'En Uso' al salir y Default Fecha
CREATE OR REPLACE FUNCTION handle_equipo_salida()
RETURNS TRIGGER AS $$
BEGIN
    -- Actualizar estado del equipo
    UPDATE equipos
    SET estado = 'En Uso'
    WHERE id = NEW.equipo_id;

    -- Default fecha retorno estimada 5:00 PM hoy si es null
    IF NEW.fecha_retorno_estimada IS NULL THEN
         NEW.fecha_retorno_estimada := CURRENT_DATE + TIME '17:00:00';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_equipo_salida
BEFORE INSERT ON movimientos_equipos
FOR EACH ROW
EXECUTE FUNCTION handle_equipo_salida();

-- 4. Trigger para actualizar estado al retornar
CREATE OR REPLACE FUNCTION handle_equipo_retorno()
RETURNS TRIGGER AS $$
BEGIN
    -- Solo si se actualiza fecha_retorno_real y antes era null
    IF OLD.fecha_retorno_real IS NULL AND NEW.fecha_retorno_real IS NOT NULL THEN
        UPDATE equipos
        SET estado = COALESCE(NEW.estado_retorno, 'Operativo')
        WHERE id = NEW.equipo_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_equipo_retorno
AFTER UPDATE ON movimientos_equipos
FOR EACH ROW
EXECUTE FUNCTION handle_equipo_retorno();

-- 5. Policies RLS (Seguridad)
ALTER TABLE equipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_equipos ENABLE ROW LEVEL SECURITY;

-- Permitir lectura a autenticados
create policy "Enable read access for authenticated users" 
on "public"."equipos"
as PERMISSIVE
for SELECT
to authenticated
using (true);

create policy "Enable insert for authenticated users" 
on "public"."equipos"
as PERMISSIVE
for INSERT
to authenticated
with check (true);

create policy "Enable update for authenticated users" 
on "public"."equipos"
as PERMISSIVE
for UPDATE
to authenticated
using (true);

create policy "Enable delete for authenticated users"
on "public"."equipos"
as PERMISSIVE
for DELETE
to authenticated
using (true);

-- Movimientos
create policy "Enable read access for authenticated users" 
on "public"."movimientos_equipos"
as PERMISSIVE
for SELECT
to authenticated
using (true);

create policy "Enable insert for authenticated users" 
on "public"."movimientos_equipos"
as PERMISSIVE
for INSERT
to authenticated
with check (true);

create policy "Enable update for authenticated users" 
on "public"."movimientos_equipos"
as PERMISSIVE
for UPDATE
to authenticated
using (true);
