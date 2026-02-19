-- Ensure Partial Indexes Exist (Crucial for the ON CONFLICT to work)
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_obra_mat ON inventario_obra (obra_id, material_id) WHERE material_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_obra_eq ON inventario_obra (obra_id, equipo_id) WHERE equipo_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_obra_epp ON inventario_obra (obra_id, epp_id) WHERE epp_id IS NOT NULL;

-- Redefine the function with the exact name used by the frontend: registrar_entrada_masiva_v2
CREATE OR REPLACE FUNCTION registrar_entrada_masiva_v2(
    p_items JSONB,
    p_doc_ref TEXT,
    p_obra_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Keep security definer to avoid RLS issues on counters
SET search_path = public
AS $$
DECLARE
    v_item RECORD;
    v_vintar_code text;
    v_year int;
    v_count int;
BEGIN
    -- Generar VINTAR único
    v_year := extract(year from current_date);
    
    -- Obtener siguiente secuencial para el año
    INSERT INTO counters (key, value)
    VALUES ('vintar_' || v_year, 1)
    ON CONFLICT (key) DO UPDATE SET value = counters.value + 1
    RETURNING value INTO v_count;

    v_vintar_code := 'VIN-' || v_year || '-' || lpad(v_count::text, 4, '0');

    -- Iterar e insertar
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        material_id uuid,
        equipo_id uuid,
        epp_id uuid,
        cantidad numeric,
        req_id uuid,
        det_req_id uuid
    )
    LOOP
        -- Insertar Movimiento
        INSERT INTO movimientos_almacen (
            obra_id,
            tipo,
            material_id,
            equipo_id,
            epp_id,
            cantidad,
            fecha,
            documento_referencia,
            requerimiento_id,
            detalle_requerimiento_id, -- ADDED
            created_at,
            vintar_code,
            destino_o_uso
        ) VALUES (
            p_obra_id,
            'ENTRADA',
            v_item.material_id,
            v_item.equipo_id,
            v_item.epp_id,
            v_item.cantidad,
            now(),
            p_doc_ref,
            v_item.req_id,
            v_item.det_req_id, -- ADDED
            now(),
            v_vintar_code,
            'Ingreso a Almacen'
        );

        -- Actualizar detalle requerimiento (si existe)
        IF v_item.det_req_id IS NOT NULL THEN
            UPDATE detalles_requerimiento
            SET cantidad_atendida = COALESCE(cantidad_atendida, 0) + v_item.cantidad,
                fecha_atencion = now(),
                estado = CASE 
                    WHEN (COALESCE(cantidad_atendida, 0) + v_item.cantidad) >= cantidad_solicitada THEN 'Atendido'
                    ELSE 'Parcial'
                END
            WHERE id = v_item.det_req_id;
        END IF;

        -- Actualizar INVENTARIO UNIFICADO (Material, Equipo o EPP)
        
        -- Material
        IF v_item.material_id IS NOT NULL THEN
            INSERT INTO inventario_obra (obra_id, material_id, cantidad_actual, ultimo_ingreso, updated_at)
            VALUES (p_obra_id, v_item.material_id, v_item.cantidad, now(), now())
            ON CONFLICT (obra_id, material_id) WHERE material_id IS NOT NULL
            DO UPDATE SET 
                cantidad_actual = inventario_obra.cantidad_actual + v_item.cantidad,
                ultimo_ingreso = now(),
                updated_at = now();
        
        -- Equipo
        ELSIF v_item.equipo_id IS NOT NULL THEN
             INSERT INTO inventario_obra (obra_id, equipo_id, cantidad_actual, ultimo_ingreso, updated_at)
            VALUES (p_obra_id, v_item.equipo_id, v_item.cantidad, now(), now())
            ON CONFLICT (obra_id, equipo_id) WHERE equipo_id IS NOT NULL
            DO UPDATE SET 
                cantidad_actual = inventario_obra.cantidad_actual + v_item.cantidad,
                ultimo_ingreso = now(),
                updated_at = now();

        -- EPP
        ELSIF v_item.epp_id IS NOT NULL THEN
             INSERT INTO inventario_obra (obra_id, epp_id, cantidad_actual, ultimo_ingreso, updated_at)
            VALUES (p_obra_id, v_item.epp_id, v_item.cantidad, now(), now())
            ON CONFLICT (obra_id, epp_id) WHERE epp_id IS NOT NULL
            DO UPDATE SET 
                cantidad_actual = inventario_obra.cantidad_actual + v_item.cantidad,
                ultimo_ingreso = now(),
                updated_at = now();
        END IF;

    END LOOP;

    RETURN jsonb_build_object('vintar_code', v_vintar_code);
END;
$$;
