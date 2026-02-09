-- 1. Create Notifications Table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id), -- Nullable if generic system alert, but usually targeted
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info', -- 'info', 'success', 'warning', 'error'
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see their own notifications
CREATE POLICY "Users can view their own notifications" ON notifications
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Service role or functions can insert (assuming logic runs as postgres or we add policy)
-- For simplicity in development, we might allow authenticated users to insert if needed, 
-- but strictly this is done by the database function which runs with sufficient privileges.

-- 2. Update registrar_entrada_almacen to Trigger Notification
CREATE OR REPLACE FUNCTION registrar_entrada_almacen(
  p_material_id UUID,
  p_cantidad NUMERIC,
  p_req_id UUID,
  p_det_req_id UUID,
  p_doc_ref TEXT,
  p_obra_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_req_solicitante TEXT;
    v_target_user_id UUID;
    v_material_desc TEXT;
    v_req_numero INT;
BEGIN
    -- 1. Insert Movement
    INSERT INTO movimientos_almacen (
        material_id, cantidad, tipo, fecha, requerimiento_id, documento_referencia, obra_id, created_at
    ) VALUES (
        p_material_id, p_cantidad, 'ENTRADA', NOW(), p_req_id, p_doc_ref, p_obra_id, NOW()
    );

    -- 2. Update Inventory
    IF EXISTS (SELECT 1 FROM inventario_obra WHERE material_id = p_material_id AND obra_id = p_obra_id) THEN
        UPDATE inventario_obra
        SET cantidad_actual = cantidad_actual + p_cantidad, ultimo_ingreso = NOW(), updated_at = NOW()
        WHERE material_id = p_material_id AND obra_id = p_obra_id;
    ELSE
        INSERT INTO inventario_obra (obra_id, material_id, cantidad_actual, ultimo_ingreso, updated_at)
        VALUES (p_obra_id, p_material_id, p_cantidad, NOW(), NOW());
    END IF;

    -- 3. Update Requirement Detail
    UPDATE detalles_requerimiento
    SET cantidad_atendida = COALESCE(cantidad_atendida, 0) + p_cantidad,
        estado = CASE 
            WHEN (COALESCE(cantidad_atendida, 0) + p_cantidad) >= cantidad_solicitada THEN 'Atendido' 
            ELSE 'Parcial' 
        END
    WHERE id = p_det_req_id;

    -- 4. NOTIFICATION LOGIC
    -- Get Requirement Info (Solicitante and Number)
    SELECT solicitante, item_correlativo INTO v_req_solicitante, v_req_numero
    FROM requerimientos
    WHERE id = p_req_id;

    -- Get Material Description
    SELECT descripcion INTO v_material_desc
    FROM materiales
    WHERE id = p_material_id;

    -- Find User ID from Profiles (Linking Solicitante Name to User ID)
    -- This assumes 'solicitante' in requerimientos matches 'nombre' in profiles exactly.
    SELECT id INTO v_target_user_id
    FROM profiles
    WHERE nombre = v_req_solicitante
    LIMIT 1;

    -- Insert Notification if user found
    IF v_target_user_id IS NOT NULL THEN
        INSERT INTO notifications (user_id, title, message, type)
        VALUES (
            v_target_user_id,
            'Material Atendido',
            'Se ha registrado el ingreso de ' || p_cantidad || ' del material ' || COALESCE(v_material_desc, 'Desconocido') || ' correspondiente a su Requerimiento #' || COALESCE(v_req_numero::TEXT, '?'),
            'success'
        );
    END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 
-- SECURITY DEFINER required to allow the function to read profiles/write notifications regardless of invoker's strict RLS
