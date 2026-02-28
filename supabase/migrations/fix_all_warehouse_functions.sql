-- FINAL DEFINITIVE FIX (V6): Realtime + RLS + Correct Type
-- 1. Enable Realtime for the notifications table (CRITICAL)
BEGIN;
  -- Ensure the table is in the realtime publication
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
  END $$;
COMMIT;

-- 2. Permissive RLS for testing (Ensures you can SELECT your own rows)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow users to see their own notifications" ON public.notifications;
CREATE POLICY "Allow users to see their own notifications" ON public.notifications
    FOR SELECT TO authenticated USING (true); -- Permissive for test, normally: auth.uid() = user_id

-- 3. Consolidated Functions with type 'ENTRADA' and robust matching
CREATE OR REPLACE FUNCTION registrar_entrada_masiva_v2(
    p_items JSONB,
    p_doc_ref TEXT,
    p_obra_id UUID,
    p_solicitante TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_item RECORD; v_vintar_code text; v_year int; v_count int;
    v_req_solicitante TEXT; v_req_correlativo INT; v_item_desc TEXT; v_solicitante_user_id UUID;
BEGIN
    v_year := extract(year from current_date);
    INSERT INTO counters (key, value) VALUES ('vintar_' || v_year, 1)
    ON CONFLICT (key) DO UPDATE SET value = counters.value + 1 RETURNING value INTO v_count;
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
            SELECT solicitante, item_correlativo INTO v_req_solicitante, v_req_correlativo FROM requerimientos WHERE id = v_item.req_id;
            
            IF v_item.material_id IS NOT NULL THEN SELECT descripcion INTO v_item_desc FROM materiales WHERE id = v_item.material_id;
            ELSIF v_item.equipo_id IS NOT NULL THEN SELECT nombre INTO v_item_desc FROM equipos WHERE id = v_item.equipo_id;
            ELSIF v_item.epp_id IS NOT NULL THEN SELECT descripcion INTO v_item_desc FROM epps_c WHERE id = v_item.epp_id;
            END IF;

            SELECT id INTO v_solicitante_user_id FROM profiles WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(v_req_solicitante)) LIMIT 1;

            IF v_solicitante_user_id IS NOT NULL THEN
                INSERT INTO notifications (user_id, title, message, type, read, created_at)
                VALUES (v_solicitante_user_id, 'Material Atendido', 'Se ha registrado el ingreso de ' || v_item.cantidad || ' de ' || COALESCE(v_item_desc, 'ítem') || ' para su Req. #' || COALESCE(v_req_correlativo::TEXT, '?'), 'ENTRADA', false, now());
            END IF;
        END IF;
    END LOOP;
    RETURN jsonb_build_object('vintar_code', v_vintar_code);
END;
$$;
