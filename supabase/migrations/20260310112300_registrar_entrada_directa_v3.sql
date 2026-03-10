-- Migration to add detalle_sc_id to movimientos_almacen and create registrar_entrada_directa_v3
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movimientos_almacen' AND column_name = 'detalle_sc_id') THEN
        ALTER TABLE movimientos_almacen ADD COLUMN detalle_sc_id UUID REFERENCES detalles_sc(id);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION registrar_entrada_directa_v3(
    p_items JSONB,
    p_doc_ref TEXT,
    p_obra_id UUID,
    p_solicitante TEXT
) RETURNS JSONB AS $$
DECLARE
    v_item RECORD;
    v_vintar_code TEXT;
    v_year INT;
    v_count INT;
    
    v_req_solicitante TEXT;
    v_req_correlativo INT;
    v_item_desc TEXT;
    v_solicitante_user_id UUID;
BEGIN
    -- Generar VINTAR único
    v_year := extract(year from current_date);
    
    INSERT INTO counters (key, value)
    VALUES ('vintar_' || v_year, 1)
    ON CONFLICT (key) DO UPDATE SET value = counters.value + 1
    RETURNING value INTO v_count;

    v_vintar_code := 'VIN-' || v_year || '-' || lpad(v_count::text, 4, '0');

    -- Iterar e insertar
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        material_id UUID,
        equipo_id UUID,
        epp_id UUID,
        cantidad NUMERIC,
        req_id UUID,
        det_req_id UUID,
        detalle_sc_id UUID
    )
    LOOP
        -- Reset variables
        v_req_solicitante := NULL;
        v_req_correlativo := NULL;
        v_item_desc := NULL;
        v_solicitante_user_id := NULL;

        -- A. Insertar Movimiento
        INSERT INTO movimientos_almacen (
            obra_id, tipo, material_id, equipo_id, epp_id, cantidad,
            fecha, documento_referencia, requerimiento_id, detalle_requerimiento_id, detalle_sc_id,
            created_at, vintar_code, destino_o_uso, solicitante
        ) VALUES (
            p_obra_id, 'ENTRADA', v_item.material_id, v_item.equipo_id, v_item.epp_id, v_item.cantidad,
            now(), p_doc_ref, v_item.req_id, v_item.det_req_id, v_item.detalle_sc_id,
            now(), v_vintar_code, 
            'Ingreso a Almacen (SC Directo)',
            p_solicitante
        );

        -- B. Actualizar detalle requerimiento
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

        -- NO hacemos update al detalle de OC porque esto es Ingreso Directo

        -- C. Actualizar INVENTARIO UNIFICADO
        IF v_item.material_id IS NOT NULL THEN
            INSERT INTO inventario_obra (obra_id, material_id, cantidad_actual, ultimo_ingreso, updated_at)
            VALUES (p_obra_id, v_item.material_id, v_item.cantidad, now(), now())
            ON CONFLICT (obra_id, material_id) WHERE material_id IS NOT NULL
            DO UPDATE SET cantidad_actual = inventario_obra.cantidad_actual + v_item.cantidad, ultimo_ingreso = now(), updated_at = now();
        ELSIF v_item.equipo_id IS NOT NULL THEN
             INSERT INTO inventario_obra (obra_id, equipo_id, cantidad_actual, ultimo_ingreso, updated_at)
            VALUES (p_obra_id, v_item.equipo_id, v_item.cantidad, now(), now())
            ON CONFLICT (obra_id, equipo_id) WHERE equipo_id IS NOT NULL
            DO UPDATE SET cantidad_actual = inventario_obra.cantidad_actual + v_item.cantidad, ultimo_ingreso = now(), updated_at = now();
        ELSIF v_item.epp_id IS NOT NULL THEN
             INSERT INTO inventario_obra (obra_id, epp_id, cantidad_actual, ultimo_ingreso, updated_at)
            VALUES (p_obra_id, v_item.epp_id, v_item.cantidad, now(), now())
            ON CONFLICT (obra_id, epp_id) WHERE epp_id IS NOT NULL
            DO UPDATE SET cantidad_actual = inventario_obra.cantidad_actual + v_item.cantidad, ultimo_ingreso = now(), updated_at = now();
        END IF;

        -- D. NOTIFICATION LOGIC
        IF v_item.req_id IS NOT NULL THEN
            SELECT solicitante, item_correlativo INTO v_req_solicitante, v_req_correlativo
            FROM public.requerimientos WHERE id = v_item.req_id;

            IF v_item.material_id IS NOT NULL THEN
                SELECT descripcion INTO v_item_desc FROM public.materiales WHERE id = v_item.material_id;
            ELSIF v_item.equipo_id IS NOT NULL THEN
                SELECT nombre INTO v_item_desc FROM public.equipos WHERE id = v_item.equipo_id;
            ELSIF v_item.epp_id IS NOT NULL THEN
                SELECT descripcion INTO v_item_desc FROM public.epps_c WHERE id = v_item.epp_id;
            END IF;

            SELECT id INTO v_solicitante_user_id FROM public.profiles
            WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(v_req_solicitante)) LIMIT 1;

            IF v_solicitante_user_id IS NOT NULL THEN
                INSERT INTO public.notifications (user_id, title, message, type, read, created_at)
                VALUES (v_solicitante_user_id, 'Material Atendido', 'Se ha registrado el ingreso de ' || v_item.cantidad || ' de ' || COALESCE(v_item_desc, 'ítem') || ' para su Req. #' || COALESCE(v_req_correlativo::TEXT, '?') || ' (SC Directo)', 'ENTRADA', false, now());
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('vintar_code', v_vintar_code);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
