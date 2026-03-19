-- 1. Asegurar que la columna orden_compra_id exista
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movimientos_almacen' AND column_name = 'orden_compra_id') THEN
        ALTER TABLE movimientos_almacen ADD COLUMN orden_compra_id UUID REFERENCES ordenes_compra(id);
    END IF;
END $$;

-- 2. Función registrar_entrada_masiva_v2 CORREGIDA (Manteniendo lógica de Costo Promedio CPP)
CREATE OR REPLACE FUNCTION registrar_entrada_masiva_v2(
    p_items JSONB,
    p_doc_ref TEXT,
    p_obra_id UUID,
    p_solicitante TEXT DEFAULT NULL,
    p_oc_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item RECORD;
    v_vintar_code text;
    v_year int;
    v_count int;
    -- Notification variables
    v_req_solicitante TEXT;
    v_req_correlativo INT;
    v_item_desc TEXT;
    v_solicitante_user_id UUID;
    -- CPP variables
    v_pu_oc numeric;
    v_cpp_antes numeric;
    v_stock_antes numeric;
    v_cpp_nuevo numeric;
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
        material_id uuid,
        equipo_id uuid,
        epp_id uuid,
        cantidad numeric,
        req_id uuid,
        det_req_id uuid,
        sc_detail_id uuid
    )
    LOOP
        -- Reset variables
        v_req_solicitante := NULL;
        v_req_correlativo := NULL;
        v_item_desc := NULL;
        v_solicitante_user_id := NULL;
        v_pu_oc := 0;
        v_cpp_antes := 0;
        v_stock_antes := 0;
        v_cpp_nuevo := 0;

        -- 1. Capturar Precio Unitario (PU) de la Orden de Compra
        IF p_oc_id IS NOT NULL AND v_item.sc_detail_id IS NOT NULL THEN
            SELECT doc.precio_unitario INTO v_pu_oc
            FROM detalles_oc doc
            WHERE doc.oc_id = p_oc_id AND doc.detalle_sc_id = v_item.sc_detail_id;
        ELSIF v_item.sc_detail_id IS NOT NULL THEN
            -- Fallback para llamadas antiguas
            SELECT doc.precio_unitario INTO v_pu_oc
            FROM detalles_oc doc
            WHERE doc.detalle_sc_id = v_item.sc_detail_id
            ORDER BY doc.created_at DESC
            LIMIT 1;
        END IF;
        v_pu_oc := COALESCE(v_pu_oc, 0);

        -- 2. Obtener stock y CPP actual
        IF v_item.material_id IS NOT NULL THEN
            SELECT cantidad_actual, costo_promedio INTO v_stock_antes, v_cpp_antes
            FROM inventario_obra WHERE obra_id = p_obra_id AND material_id = v_item.material_id;
        ELSIF v_item.equipo_id IS NOT NULL THEN
            SELECT cantidad_actual, costo_promedio INTO v_stock_antes, v_cpp_antes
            FROM inventario_obra WHERE obra_id = p_obra_id AND equipo_id = v_item.equipo_id;
        ELSIF v_item.epp_id IS NOT NULL THEN
            SELECT cantidad_actual, costo_promedio INTO v_stock_antes, v_cpp_antes
            FROM inventario_obra WHERE obra_id = p_obra_id AND epp_id = v_item.epp_id;
        END IF;
        v_stock_antes := COALESCE(v_stock_antes, 0);
        v_cpp_antes := COALESCE(v_cpp_antes, 0);

        -- 3. Calcular nuevo CPP
        IF (v_stock_antes + v_item.cantidad) > 0 THEN
            v_cpp_nuevo := ((v_stock_antes * v_cpp_antes) + (v_item.cantidad * v_pu_oc)) / (v_stock_antes + v_item.cantidad);
        ELSE
            v_cpp_nuevo := v_pu_oc;
        END IF;

        -- A. Insertar Movimiento (con costo unitario capturado)
        INSERT INTO movimientos_almacen (
            obra_id, tipo, material_id, equipo_id, epp_id, cantidad,
            fecha, documento_referencia, requerimiento_id, detalle_requerimiento_id,
            detalle_sc_id, orden_compra_id, costo_unitario, created_at, vintar_code, destino_o_uso, solicitante
        ) VALUES (
            p_obra_id, 'ENTRADA', v_item.material_id, v_item.equipo_id, v_item.epp_id, v_item.cantidad,
            now(), p_doc_ref, v_item.req_id, v_item.det_req_id,
            v_item.sc_detail_id, p_oc_id, v_pu_oc, now(), v_vintar_code, 
            CASE WHEN p_doc_ref = 'STOCK INICIAL' THEN 'Carga de Stock Inicial' ELSE 'Ingreso a Almacen' END,
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

        -- C. Actualizar Inventario con CPP
        IF v_item.material_id IS NOT NULL THEN
            INSERT INTO inventario_obra (obra_id, material_id, cantidad_actual, costo_promedio, ultimo_ingreso, updated_at)
            VALUES (p_obra_id, v_item.material_id, v_item.cantidad, v_cpp_nuevo, now(), now())
            ON CONFLICT (obra_id, material_id) WHERE material_id IS NOT NULL
            DO UPDATE SET 
                costo_promedio = v_cpp_nuevo,
                cantidad_actual = inventario_obra.cantidad_actual + v_item.cantidad, 
                ultimo_ingreso = now(), updated_at = now();
        ELSIF v_item.equipo_id IS NOT NULL THEN
             INSERT INTO inventario_obra (obra_id, equipo_id, cantidad_actual, costo_promedio, ultimo_ingreso, updated_at)
            VALUES (p_obra_id, v_item.equipo_id, v_item.cantidad, v_cpp_nuevo, now(), now())
            ON CONFLICT (obra_id, equipo_id) WHERE equipo_id IS NOT NULL
            DO UPDATE SET 
                costo_promedio = v_cpp_nuevo,
                cantidad_actual = inventario_obra.cantidad_actual + v_item.cantidad, 
                ultimo_ingreso = now(), updated_at = now();
        ELSIF v_item.epp_id IS NOT NULL THEN
             INSERT INTO inventario_obra (obra_id, epp_id, cantidad_actual, costo_promedio, ultimo_ingreso, updated_at)
            VALUES (p_obra_id, v_item.epp_id, v_item.cantidad, v_cpp_nuevo, now(), now())
            ON CONFLICT (obra_id, epp_id) WHERE epp_id IS NOT NULL
            DO UPDATE SET 
                costo_promedio = v_cpp_nuevo,
                cantidad_actual = inventario_obra.cantidad_actual + v_item.cantidad, 
                ultimo_ingreso = now(), updated_at = now();
        END IF;

        -- D. Auditoría: historial_costos
        INSERT INTO historial_costos (obra_id, material_id, equipo_id, epp_id, costo_promedio_antes, costo_promedio_despues, movimiento_tipo, cantidad, precio_unitario_usado)
        VALUES (p_obra_id, v_item.material_id, v_item.equipo_id, v_item.epp_id, v_cpp_antes, v_cpp_nuevo, 'ENTRADA', v_item.cantidad, v_pu_oc);

        -- E. Notificaciones
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
                VALUES (v_solicitante_user_id, 'Material Atendido', 'Se ha registrado el ingreso de ' || v_item.cantidad || ' de ' || COALESCE(v_item_desc, 'ítem') || ' para su Req. #' || COALESCE(v_req_correlativo::TEXT, '?'), 'ENTRADA', false, now());
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('vintar_code', v_vintar_code);
END;
$$;
