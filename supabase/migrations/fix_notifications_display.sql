-- STEP 1: Ensure RLS allows the user to SEE their own notifications
-- Realtime requires that the user has SELECT permission on the row to receive the event.
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see their own notifications" ON public.notifications;
CREATE POLICY "Users can see their own notifications" ON public.notifications
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can do everything" ON public.notifications;
CREATE POLICY "Service role can do everything" ON public.notifications
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- STEP 2: Update functions with robust name matching (LOWER + TRIM)
-- This ensures that if the profile is "Administrador" and the req is "administrador ", it still works.

CREATE OR REPLACE FUNCTION registrar_entrada_masiva_v2(
    p_items JSONB,
    p_doc_ref TEXT,
    p_obra_id UUID,
    p_solicitante TEXT DEFAULT NULL
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
    v_req_solicitante TEXT;
    v_req_correlativo INT;
    v_item_desc TEXT;
    v_solicitante_user_id UUID;
BEGIN
    v_year := extract(year from current_date);
    INSERT INTO counters (key, value)
    VALUES ('vintar_' || v_year, 1)
    ON CONFLICT (key) DO UPDATE SET value = counters.value + 1
    RETURNING value INTO v_count;
    v_vintar_code := 'VIN-' || v_year || '-' || lpad(v_count::text, 4, '0');

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        material_id uuid, equipo_id uuid, epp_id uuid, cantidad numeric,
        req_id uuid, det_req_id uuid, sc_detail_id uuid
    )
    LOOP
        v_req_solicitante := NULL; v_req_correlativo := NULL; v_item_desc := NULL; v_solicitante_user_id := NULL;

        INSERT INTO movimientos_almacen (
            obra_id, tipo, material_id, equipo_id, epp_id, cantidad, fecha, documento_referencia,
            requerimiento_id, detalle_requerimiento_id, created_at, vintar_code, destino_o_uso, solicitante
        ) VALUES (
            p_obra_id, 'ENTRADA', v_item.material_id, v_item.equipo_id, v_item.epp_id, v_item.cantidad,
            now(), p_doc_ref, v_item.req_id, v_item.det_req_id, now(), v_vintar_code,
            CASE WHEN p_doc_ref = 'STOCK INICIAL' THEN 'Carga de Stock Inicial' ELSE 'Ingreso a Almacen' END,
            p_solicitante
        );

        IF v_item.det_req_id IS NOT NULL THEN
            UPDATE detalles_requerimiento
            SET cantidad_atendida = COALESCE(cantidad_atendida, 0) + v_item.cantidad,
                fecha_atencion = now(),
                estado = CASE WHEN (COALESCE(cantidad_atendida, 0) + v_item.cantidad) >= cantidad_solicitada THEN 'Atendido' ELSE 'Parcial' END
            WHERE id = v_item.det_req_id;
        END IF;

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

        IF v_item.req_id IS NOT NULL THEN
            SELECT solicitante, item_correlativo INTO v_req_solicitante, v_req_correlativo
            FROM public.requerimientos WHERE id = v_item.req_id;

            IF v_item.material_id IS NOT NULL THEN SELECT descripcion INTO v_item_desc FROM public.materiales WHERE id = v_item.material_id;
            ELSIF v_item.equipo_id IS NOT NULL THEN SELECT nombre INTO v_item_desc FROM public.equipos WHERE id = v_item.equipo_id;
            ELSIF v_item.epp_id IS NOT NULL THEN SELECT descripcion INTO v_item_desc FROM public.epps_c WHERE id = v_item.epp_id;
            END IF;

            -- Robust matching (LOWER + TRIM)
            SELECT id INTO v_solicitante_user_id FROM public.profiles
            WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(v_req_solicitante)) LIMIT 1;

            IF v_solicitante_user_id IS NOT NULL THEN
                INSERT INTO public.notifications (user_id, title, message, type, read)
                VALUES (v_solicitante_user_id, 'Material Atendido', 'Ingreso de ' || v_item.cantidad || ' de ' || COALESCE(v_item_desc, 'ítem') || ' para su Req. #' || COALESCE(v_req_correlativo::TEXT, '?'), 'success', false);
            END IF;
        END IF;
    END LOOP;
    RETURN jsonb_build_object('vintar_code', v_vintar_code);
END;
$$;

CREATE OR REPLACE FUNCTION registrar_entrada_caja_chica(
  p_requerimiento_id UUID, p_detalle_req_id UUID, p_material_id UUID, p_equipo_id UUID, p_epp_id UUID, p_cantidad NUMERIC, p_factura TEXT, p_usuario TEXT, p_obra_id UUID, p_frente_id UUID DEFAULT NULL
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_vintar_code text; v_year int; v_count int; v_req_solicitante text; v_req_correlativo int; v_solicitante_user_id uuid; v_item_desc text;
BEGIN
  v_year := extract(year from current_date);
  INSERT INTO counters (key, value) VALUES ('vintar_' || v_year, 1) ON CONFLICT (key) DO UPDATE SET value = counters.value + 1 RETURNING value INTO v_count;
  v_vintar_code := 'VIN-' || v_year || '-' || lpad(v_count::text, 4, '0');

  INSERT INTO public.movimientos_almacen (tipo, material_id, equipo_id, epp_id, cantidad, documento_referencia, requerimiento_id, detalle_requerimiento_id, destino_o_uso, solicitante, obra_id, vintar_code)
  VALUES ('ENTRADA', p_material_id, p_equipo_id, p_epp_id, p_cantidad, p_factura, p_requerimiento_id, p_detalle_req_id, 'COMPRA CAJA CHICA', p_usuario, p_obra_id, v_vintar_code);

  UPDATE public.detalles_requerimiento SET cantidad_caja_chica = COALESCE(cantidad_caja_chica, 0) + p_cantidad, cantidad_atendida = COALESCE(cantidad_atendida, 0) + p_cantidad, estado = CASE WHEN (COALESCE(cantidad_atendida, 0) + p_cantidad) >= cantidad_solicitada THEN 'Atendido' ELSE 'Parcial' END WHERE id = p_detalle_req_id;

  IF p_material_id IS NOT NULL THEN INSERT INTO inventario_obra (obra_id, material_id, cantidad_actual, ultimo_ingreso, updated_at) VALUES (p_obra_id, p_material_id, p_cantidad, now(), now()) ON CONFLICT (obra_id, material_id) WHERE material_id IS NOT NULL DO UPDATE SET cantidad_actual = inventario_obra.cantidad_actual + p_cantidad, ultimo_ingreso = now(), updated_at = now();
  ELSIF p_equipo_id IS NOT NULL THEN INSERT INTO inventario_obra (obra_id, equipo_id, cantidad_actual, ultimo_ingreso, updated_at) VALUES (p_obra_id, p_equipo_id, p_cantidad, now(), now()) ON CONFLICT (obra_id, equipo_id) WHERE equipo_id IS NOT NULL DO UPDATE SET cantidad_actual = inventario_obra.cantidad_actual + p_cantidad, ultimo_ingreso = now(), updated_at = now();
  ELSIF p_epp_id IS NOT NULL THEN INSERT INTO inventario_obra (obra_id, epp_id, cantidad_actual, ultimo_ingreso, updated_at) VALUES (p_obra_id, p_epp_id, p_cantidad, now(), now()) ON CONFLICT (obra_id, epp_id) WHERE epp_id IS NOT NULL DO UPDATE SET cantidad_actual = inventario_obra.cantidad_actual + p_cantidad, ultimo_ingreso = now(), updated_at = now();
  END IF;

  IF p_requerimiento_id IS NOT NULL THEN
    SELECT r.solicitante, r.item_correlativo INTO v_req_solicitante, v_req_correlativo FROM public.requerimientos r WHERE r.id = p_requerimiento_id;
    IF p_material_id IS NOT NULL THEN SELECT descripcion INTO v_item_desc FROM public.materiales WHERE id = p_material_id;
    ELSIF p_equipo_id IS NOT NULL THEN SELECT nombre INTO v_item_desc FROM public.equipos WHERE id = p_equipo_id;
    ELSIF p_epp_id IS NOT NULL THEN SELECT descripcion INTO v_item_desc FROM public.epps_c WHERE id = p_epp_id;
    END IF;

    SELECT id INTO v_solicitante_user_id FROM public.profiles WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(v_req_solicitante)) LIMIT 1;
    IF v_solicitante_user_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, message, type, read)
      VALUES (v_solicitante_user_id, 'Atención Req. #' || v_req_correlativo || ' (Caja Chica)', COALESCE(v_item_desc, 'Ítem') || ' — ' || p_cantidad || ' und. ingresadas al almacén.', 'success', false);
    END IF;
  END IF;

  RETURN v_vintar_code;
END;
$$;
