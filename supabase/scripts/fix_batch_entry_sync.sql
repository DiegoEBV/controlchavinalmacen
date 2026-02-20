-- Fix for registrar_entrada_masiva to update requerimientos
-- Also ensures VINTAR code generation and counters table exist
-- AND Backfills missing updates for existing entries

-- 1. Ensure counters table exists
CREATE TABLE IF NOT EXISTS counters (
    key TEXT PRIMARY KEY,
    last_val INTEGER DEFAULT 0,
    year INTEGER DEFAULT 0
);

-- 2. Redefine registrar_entrada_masiva
CREATE OR REPLACE FUNCTION registrar_entrada_masiva(
    p_items JSONB,
    p_doc_ref TEXT,
    p_obra_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_year INTEGER;
    v_last_val INTEGER;
    v_vintar_code TEXT;
    v_item JSONB;
    v_material_id UUID;
    v_req_id UUID;
    v_det_req_id UUID;
    v_cantidad NUMERIC;
BEGIN
    -- 1. Generate VINTAR Code
    v_year := EXTRACT(YEAR FROM NOW());
    
    -- Lock the counter row for generic 'vintar_code' key
    INSERT INTO counters (key, last_val, year)
    VALUES ('vintar_code', 0, v_year)
    ON CONFLICT (key) DO NOTHING;
    
    SELECT last_val, year INTO v_last_val, v_year
    FROM counters WHERE key = 'vintar_code' FOR UPDATE;
    
    -- Check year reset
    IF v_year != EXTRACT(YEAR FROM NOW()) THEN
        v_year := EXTRACT(YEAR FROM NOW());
        v_last_val := 0;
    END IF;
    
    v_last_val := v_last_val + 1;
    v_vintar_code := 'VIN-' || v_year || '-' || LPAD(v_last_val::TEXT, 5, '0');
    
    -- Update counter
    UPDATE counters 
    SET last_val = v_last_val, year = v_year 
    WHERE key = 'vintar_code';

    -- 2. Iterate Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_material_id := (v_item->>'material_id')::UUID;
        v_cantidad := (v_item->>'cantidad')::NUMERIC;
        v_req_id := (v_item->>'req_id')::UUID;
        v_det_req_id := (v_item->>'det_req_id')::UUID;

        -- A. Insert Movement
        INSERT INTO movimientos_almacen (
            material_id,
            cantidad,
            tipo,
            fecha,
            requerimiento_id,
            documento_referencia,
            obra_id,
            vintar_code,
            created_at
        ) VALUES (
            v_material_id,
            v_cantidad,
            'ENTRADA',
            NOW(),
            v_req_id,
            p_doc_ref,
            p_obra_id,
            v_vintar_code,
            NOW()
        );

        -- B. Update Inventory (Stock)
        IF EXISTS (SELECT 1 FROM inventario_obra WHERE material_id = v_material_id AND obra_id = p_obra_id) THEN
            UPDATE inventario_obra
            SET cantidad_actual = cantidad_actual + v_cantidad,
                ultimo_ingreso = NOW(),
                updated_at = NOW()
            WHERE material_id = v_material_id AND obra_id = p_obra_id;
        ELSE
            INSERT INTO inventario_obra (
                obra_id,
                material_id,
                cantidad_actual,
                ultimo_ingreso,
                updated_at
            ) VALUES (
                p_obra_id,
                v_material_id,
                v_cantidad,
                NOW(),
                NOW()
            );
        END IF;

        -- C. Update Requirement Detail
        UPDATE detalles_requerimiento
        SET cantidad_atendida = COALESCE(cantidad_atendida, 0) + v_cantidad,
            estado = CASE 
                WHEN (COALESCE(cantidad_atendida, 0) + v_cantidad) >= cantidad_solicitada THEN 'Atendido' 
                ELSE 'Parcial' 
            END
        WHERE id = v_det_req_id;

    END LOOP;

    RETURN jsonb_build_object(
        'vintar_code', v_vintar_code,
        'items_count', jsonb_array_length(p_items)
    );
END;
$$;

-- 3. BACKFILL FIX: Update existing Requirement Details based on Movements
-- This fixes the issue where previous entries didn't update the requirement status
DO $$
BEGIN
    UPDATE detalles_requerimiento dr
    SET cantidad_atendida = sub.total_atendido,
        estado = CASE 
            WHEN sub.total_atendido >= dr.cantidad_solicitada THEN 'Atendido' 
            ELSE 'Parcial' 
        END
    FROM (
        SELECT 
            ma.requerimiento_id,
            m.descripcion,
            m.categoria,
            SUM(ma.cantidad) as total_atendido
        FROM movimientos_almacen ma
        JOIN materiales m ON ma.material_id = m.id
        WHERE ma.tipo = 'ENTRADA'
        GROUP BY ma.requerimiento_id, m.descripcion, m.categoria
    ) sub
    WHERE dr.requerimiento_id = sub.requerimiento_id
      AND dr.descripcion = sub.descripcion
      AND dr.material_categoria = sub.categoria;
END $$;
