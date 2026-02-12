
-- 1. Agregar columna nombre_solicitante (Texto libre para quien retira)
ALTER TABLE movimientos_equipos 
ADD COLUMN IF NOT EXISTS nombre_solicitante TEXT;

-- 2. Agregar columna encargado_id (Usuario del sistema que es responsable/producción)
ALTER TABLE movimientos_equipos 
ADD COLUMN IF NOT EXISTS encargado_id UUID REFERENCES auth.users(id);

-- 3. Hacer solicitante_id opcional (nullable) ya que ahora usaremos nombre_solicitante o encargados
ALTER TABLE movimientos_equipos 
ALTER COLUMN solicitante_id DROP NOT NULL;

-- 4. Actualizar políticas RLS si es necesario (el insert ya permite authenticated)
-- No se requieren cambios adicionales en policies dado que 'authenticated' ya tiene acceso.
