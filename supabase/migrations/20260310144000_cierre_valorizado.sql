-- ========================================================================
-- MIGRATION: Cierre Valorizado (CPP System)
-- Adds cost tracking (costo_promedio) to inventario_obra,
-- costo_unitario to movimientos_almacen, and creates historial_costos.
-- Updates all entry/exit functions with CPP calculation logic.
-- ========================================================================

-- =====================
-- 1. SCHEMA CHANGES
-- =====================

-- 1a. Add costo_promedio to inventario_obra
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventario_obra' AND column_name = 'costo_promedio') THEN
        ALTER TABLE public.inventario_obra ADD COLUMN costo_promedio numeric DEFAULT 0;
    END IF;
END $$;

-- 1b. Add costo_unitario to movimientos_almacen (frozen cost at time of movement)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'movimientos_almacen' AND column_name = 'costo_unitario') THEN
        ALTER TABLE public.movimientos_almacen ADD COLUMN costo_unitario numeric DEFAULT 0;
    END IF;
END $$;

-- 1c. Create historial_costos for auditing CPP changes
CREATE TABLE IF NOT EXISTS public.historial_costos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    obra_id uuid REFERENCES public.obras(id),
    material_id uuid REFERENCES public.materiales(id),
    equipo_id uuid REFERENCES public.equipos(id),
    epp_id uuid REFERENCES public.epps_c(id),
    costo_promedio_antes numeric DEFAULT 0,
    costo_promedio_despues numeric DEFAULT 0,
    movimiento_tipo text, -- 'ENTRADA' or 'SALIDA'
    cantidad numeric DEFAULT 0,
    precio_unitario_usado numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historial_costos_obra ON public.historial_costos (obra_id);
CREATE INDEX IF NOT EXISTS idx_historial_costos_material ON public.historial_costos (material_id);

-- =====================
-- 2. UPDATED FUNCTIONS
-- =====================

-- -------------------------------------------------------
-- 2a. registrar_entrada_masiva_v2 (OC entries)
--     Fetches PU from detalles_oc via sc_detail_id
-- -------------------------------------------------------
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
    v_pu_oc numeric;
    v_cpp_antes numeric;
    v_stock_antes numeric;
    v_cpp_nuevo numeric;
BEGIN
    v_year := extract(year from current_date);

    INSERT INTO counters (key, value)
    VALUES ('vintar_' || v_year, 1)
    ON CONFLICT (key) DO UPDATE SET value = counters.value + 1
    RETURNING value INTO v_count;

    v_vintar_code := 'VIN-' || v_year || '-' || lpad(v_count::text, 4, '0');

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
        v_req_solicitante := NULL;
        v_req_correlativo := NULL;
        v_item_desc := NULL;
        v_solicitante_user_id := NULL;
        v_pu_oc := 0;
        v_cpp_antes := 0;
        v_stock_antes := 0;
        v_cpp_nuevo := 0;

        -- 1. Fetch PU from detalles_oc (if sc_detail_id is provided and maps to an OC)
        IF v_item.sc_detail_id IS NOT NULL THEN
            SELECT doc.precio_unitario INTO v_pu_oc
            FROM detalles_oc doc
            WHERE doc.detalle_sc_id = v_item.sc_detail_id
            ORDER BY doc.created_at DESC
            LIMIT 1;
        END IF;
        v_pu_oc := COALESCE(v_pu_oc, 0);

        -- 2. Get current stock and CPP for the item
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

        -- 3. Calculate new CPP
        IF (v_stock_antes + v_item.cantidad) > 0 THEN
            v_cpp_nuevo := ((v_stock_antes * v_cpp_antes) + (v_item.cantidad * v_pu_oc)) / (v_stock_antes + v_item.cantidad);
        ELSE
            v_cpp_nuevo := v_pu_oc;
        END IF;

        -- A. Insert Movement (with frozen PU)
        INSERT INTO movimientos_almacen (
            obra_id, tipo, material_id, equipo_id, epp_id, cantidad,
            fecha, documento_referencia, requerimiento_id, detalle_requerimiento_id,
            created_at, vintar_code, destino_o_uso, solicitante, costo_unitario
        ) VALUES (
            p_obra_id, 'ENTRADA', v_item.material_id, v_item.equipo_id, v_item.epp_id, v_item.cantidad,
            now(), p_doc_ref, v_item.req_id, v_item.det_req_id,
            now(), v_vintar_code,
            CASE WHEN p_doc_ref = 'STOCK INICIAL' THEN 'Carga de Stock Inicial' ELSE 'Ingreso a Almacen' END,
            p_solicitante, v_pu_oc
        );

        -- B. Update detalle requerimiento
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

        -- C. Update INVENTARIO with CPP
        IF v_item.material_id IS NOT NULL THEN
            INSERT INTO inventario_obra (obra_id, material_id, cantidad_actual, costo_promedio, ultimo_ingreso, updated_at)
            VALUES (p_obra_id, v_item.material_id, v_item.cantidad, v_cpp_nuevo, now(), now())
            ON CONFLICT (obra_id, material_id) WHERE material_id IS NOT NULL
            DO UPDATE SET
                costo_promedio = v_cpp_nuevo,
                cantidad_actual = inventario_obra.cantidad_actual + v_item.cantidad,
                ultimo_ingreso = now(),
                updated_at = now();
        ELSIF v_item.equipo_id IS NOT NULL THEN
            INSERT INTO inventario_obra (obra_id, equipo_id, cantidad_actual, costo_promedio, ultimo_ingreso, updated_at)
            VALUES (p_obra_id, v_item.equipo_id, v_item.cantidad, v_cpp_nuevo, now(), now())
            ON CONFLICT (obra_id, equipo_id) WHERE equipo_id IS NOT NULL
            DO UPDATE SET
                costo_promedio = v_cpp_nuevo,
                cantidad_actual = inventario_obra.cantidad_actual + v_item.cantidad,
                ultimo_ingreso = now(),
                updated_at = now();
        ELSIF v_item.epp_id IS NOT NULL THEN
            INSERT INTO inventario_obra (obra_id, epp_id, cantidad_actual, costo_promedio, ultimo_ingreso, updated_at)
            VALUES (p_obra_id, v_item.epp_id, v_item.cantidad, v_cpp_nuevo, now(), now())
            ON CONFLICT (obra_id, epp_id) WHERE epp_id IS NOT NULL
            DO UPDATE SET
                costo_promedio = v_cpp_nuevo,
                cantidad_actual = inventario_obra.cantidad_actual + v_item.cantidad,
                ultimo_ingreso = now(),
                updated_at = now();
        END IF;

        -- D. Audit: historial_costos
        INSERT INTO historial_costos (obra_id, material_id, equipo_id, epp_id, costo_promedio_antes, costo_promedio_despues, movimiento_tipo, cantidad, precio_unitario_usado)
        VALUES (p_obra_id, v_item.material_id, v_item.equipo_id, v_item.epp_id, v_cpp_antes, v_cpp_nuevo, 'ENTRADA', v_item.cantidad, v_pu_oc);

        -- E. Notification logic
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
                INSERT INTO public.notifications (user_id, title, message, type)
                VALUES (v_solicitante_user_id, 'Material Atendido',
                    'Se ha registrado el ingreso de ' || v_item.cantidad || ' de ' || COALESCE(v_item_desc, 'ítem') || ' para su Req. #' || COALESCE(v_req_correlativo::TEXT, '?'),
                    'success');
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('vintar_code', v_vintar_code);
END;
$$;

-- -------------------------------------------------------
-- 2b. registrar_entrada_directa_v3 (SC Direct entries)
--     Fetches PU from detalles_oc via detalle_sc_id
-- -------------------------------------------------------
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
    v_pu_oc numeric;
    v_cpp_antes numeric;
    v_stock_antes numeric;
    v_cpp_nuevo numeric;
BEGIN
    v_year := extract(year from current_date);

    INSERT INTO counters (key, value)
    VALUES ('vintar_' || v_year, 1)
    ON CONFLICT (key) DO UPDATE SET value = counters.value + 1
    RETURNING value INTO v_count;

    v_vintar_code := 'VIN-' || v_year || '-' || lpad(v_count::text, 4, '0');

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
        v_req_solicitante := NULL;
        v_req_correlativo := NULL;
        v_item_desc := NULL;
        v_solicitante_user_id := NULL;
        v_pu_oc := 0;
        v_cpp_antes := 0;
        v_stock_antes := 0;
        v_cpp_nuevo := 0;

        -- 1. Try to fetch PU from detalles_oc (might not exist for direct entries)
        IF v_item.detalle_sc_id IS NOT NULL THEN
            SELECT doc.precio_unitario INTO v_pu_oc
            FROM detalles_oc doc
            WHERE doc.detalle_sc_id = v_item.detalle_sc_id
            ORDER BY doc.created_at DESC
            LIMIT 1;
        END IF;
        v_pu_oc := COALESCE(v_pu_oc, 0);

        -- 2. Get current stock and CPP
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

        -- 3. Calculate new CPP
        IF (v_stock_antes + v_item.cantidad) > 0 THEN
            v_cpp_nuevo := ((v_stock_antes * v_cpp_antes) + (v_item.cantidad * v_pu_oc)) / (v_stock_antes + v_item.cantidad);
        ELSE
            v_cpp_nuevo := v_pu_oc;
        END IF;

        -- A. Insert Movement
        INSERT INTO movimientos_almacen (
            obra_id, tipo, material_id, equipo_id, epp_id, cantidad,
            fecha, documento_referencia, requerimiento_id, detalle_requerimiento_id, detalle_sc_id,
            created_at, vintar_code, destino_o_uso, solicitante, costo_unitario
        ) VALUES (
            p_obra_id, 'ENTRADA', v_item.material_id, v_item.equipo_id, v_item.epp_id, v_item.cantidad,
            now(), p_doc_ref, v_item.req_id, v_item.det_req_id, v_item.detalle_sc_id,
            now(), v_vintar_code, 'Ingreso a Almacen (SC Directo)', p_solicitante, v_pu_oc
        );

        -- B. Update detalle requerimiento
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

        -- C. Update INVENTARIO with CPP
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

        -- D. Audit
        INSERT INTO historial_costos (obra_id, material_id, equipo_id, epp_id, costo_promedio_antes, costo_promedio_despues, movimiento_tipo, cantidad, precio_unitario_usado)
        VALUES (p_obra_id, v_item.material_id, v_item.equipo_id, v_item.epp_id, v_cpp_antes, v_cpp_nuevo, 'ENTRADA', v_item.cantidad, v_pu_oc);

        -- E. Notification
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
                VALUES (v_solicitante_user_id, 'Material Atendido',
                    'Se ha registrado el ingreso de ' || v_item.cantidad || ' de ' || COALESCE(v_item_desc, 'ítem') || ' para su Req. #' || COALESCE(v_req_correlativo::TEXT, '?') || ' (SC Directo)',
                    'ENTRADA', false, now());
            END IF;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('vintar_code', v_vintar_code);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -------------------------------------------------------
-- 2c. registrar_entrada_caja_chica (with optional PU)
--     If p_precio_unitario is NULL or 0, CPP stays same.
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION registrar_entrada_caja_chica(
  p_requerimiento_id UUID,
  p_detalle_req_id UUID,
  p_material_id UUID,
  p_equipo_id UUID,
  p_epp_id UUID,
  p_cantidad NUMERIC,
  p_factura TEXT,
  p_usuario TEXT,
  p_obra_id UUID,
  p_frente_id UUID DEFAULT NULL,
  p_precio_unitario NUMERIC DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vintar_code text;
  v_year int;
  v_count int;
  v_req_solicitante text;
  v_req_correlativo int;
  v_solicitante_user_id uuid;
  v_item_desc text;
  v_cpp_antes numeric;
  v_stock_antes numeric;
  v_cpp_nuevo numeric;
  v_pu_usado numeric;
BEGIN
  v_year := extract(year from current_date);

  INSERT INTO counters (key, value) VALUES ('vintar_' || v_year, 1)
  ON CONFLICT (key) DO UPDATE SET value = counters.value + 1
  RETURNING value INTO v_count;
  v_vintar_code := 'VIN-' || v_year || '-' || lpad(v_count::text, 4, '0');

  -- 1. Get current stock and CPP
  v_cpp_antes := 0;
  v_stock_antes := 0;
  IF p_material_id IS NOT NULL THEN
      SELECT cantidad_actual, costo_promedio INTO v_stock_antes, v_cpp_antes
      FROM inventario_obra WHERE obra_id = p_obra_id AND material_id = p_material_id;
  ELSIF p_equipo_id IS NOT NULL THEN
      SELECT cantidad_actual, costo_promedio INTO v_stock_antes, v_cpp_antes
      FROM inventario_obra WHERE obra_id = p_obra_id AND equipo_id = p_equipo_id;
  ELSIF p_epp_id IS NOT NULL THEN
      SELECT cantidad_actual, costo_promedio INTO v_stock_antes, v_cpp_antes
      FROM inventario_obra WHERE obra_id = p_obra_id AND epp_id = p_epp_id;
  END IF;
  v_stock_antes := COALESCE(v_stock_antes, 0);
  v_cpp_antes := COALESCE(v_cpp_antes, 0);

  -- 2. Calculate new CPP
  IF p_precio_unitario IS NOT NULL AND p_precio_unitario > 0 THEN
      v_pu_usado := p_precio_unitario;
      IF (v_stock_antes + p_cantidad) > 0 THEN
          v_cpp_nuevo := ((v_stock_antes * v_cpp_antes) + (p_cantidad * v_pu_usado)) / (v_stock_antes + p_cantidad);
      ELSE
          v_cpp_nuevo := v_pu_usado;
      END IF;
  ELSE
      -- No price provided: CPP stays the same
      v_pu_usado := v_cpp_antes;
      v_cpp_nuevo := v_cpp_antes;
  END IF;

  -- A. Insert movement
  INSERT INTO public.movimientos_almacen (
    tipo, material_id, equipo_id, epp_id, cantidad, documento_referencia, requerimiento_id,
    detalle_requerimiento_id, destino_o_uso, solicitante, obra_id, vintar_code, costo_unitario
  ) VALUES (
    'ENTRADA', p_material_id, p_equipo_id, p_epp_id, p_cantidad, p_factura, p_requerimiento_id,
    p_detalle_req_id, 'COMPRA CAJA CHICA', p_usuario, p_obra_id, v_vintar_code, v_pu_usado
  );

  -- B. Update detalle requerimiento
  UPDATE public.detalles_requerimiento
  SET
    cantidad_caja_chica = COALESCE(cantidad_caja_chica, 0) + p_cantidad,
    cantidad_atendida = COALESCE(cantidad_atendida, 0) + p_cantidad,
    estado = CASE WHEN (COALESCE(cantidad_atendida, 0) + p_cantidad) >= cantidad_solicitada THEN 'Atendido' ELSE 'Parcial' END
  WHERE id = p_detalle_req_id;

  -- C. Update INVENTARIO with CPP
  IF p_material_id IS NOT NULL THEN
      INSERT INTO inventario_obra (obra_id, material_id, cantidad_actual, costo_promedio, ultimo_ingreso, updated_at)
      VALUES (p_obra_id, p_material_id, p_cantidad, v_cpp_nuevo, now(), now())
      ON CONFLICT (obra_id, material_id) WHERE material_id IS NOT NULL
      DO UPDATE SET
          costo_promedio = v_cpp_nuevo,
          cantidad_actual = inventario_obra.cantidad_actual + p_cantidad,
          ultimo_ingreso = now(), updated_at = now();
  ELSIF p_equipo_id IS NOT NULL THEN
      INSERT INTO inventario_obra (obra_id, equipo_id, cantidad_actual, costo_promedio, ultimo_ingreso, updated_at)
      VALUES (p_obra_id, p_equipo_id, p_cantidad, v_cpp_nuevo, now(), now())
      ON CONFLICT (obra_id, equipo_id) WHERE equipo_id IS NOT NULL
      DO UPDATE SET
          costo_promedio = v_cpp_nuevo,
          cantidad_actual = inventario_obra.cantidad_actual + p_cantidad,
          ultimo_ingreso = now(), updated_at = now();
  ELSIF p_epp_id IS NOT NULL THEN
      INSERT INTO inventario_obra (obra_id, epp_id, cantidad_actual, costo_promedio, ultimo_ingreso, updated_at)
      VALUES (p_obra_id, p_epp_id, p_cantidad, v_cpp_nuevo, now(), now())
      ON CONFLICT (obra_id, epp_id) WHERE epp_id IS NOT NULL
      DO UPDATE SET
          costo_promedio = v_cpp_nuevo,
          cantidad_actual = inventario_obra.cantidad_actual + p_cantidad,
          ultimo_ingreso = now(), updated_at = now();
  END IF;

  -- D. Audit
  INSERT INTO historial_costos (obra_id, material_id, equipo_id, epp_id, costo_promedio_antes, costo_promedio_despues, movimiento_tipo, cantidad, precio_unitario_usado)
  VALUES (p_obra_id, p_material_id, p_equipo_id, p_epp_id, v_cpp_antes, v_cpp_nuevo, 'ENTRADA', p_cantidad, v_pu_usado);

  -- E. Notification
  IF p_requerimiento_id IS NOT NULL THEN
    SELECT r.solicitante, r.item_correlativo INTO v_req_solicitante, v_req_correlativo
    FROM public.requerimientos r WHERE r.id = p_requerimiento_id;

    IF p_material_id IS NOT NULL THEN
      SELECT descripcion INTO v_item_desc FROM public.materiales WHERE id = p_material_id;
    ELSIF p_equipo_id IS NOT NULL THEN
      SELECT nombre INTO v_item_desc FROM public.equipos WHERE id = p_equipo_id;
    ELSIF p_epp_id IS NOT NULL THEN
      SELECT descripcion INTO v_item_desc FROM public.epps_c WHERE id = p_epp_id;
    END IF;

    SELECT id INTO v_solicitante_user_id FROM public.profiles
    WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(v_req_solicitante)) LIMIT 1;

    IF v_solicitante_user_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, message, type)
      VALUES (
        v_solicitante_user_id,
        'Atención Req. #' || v_req_correlativo || ' (Caja Chica)',
        COALESCE(v_item_desc, 'Ítem') || ' — ' || p_cantidad || ' und. ingresadas al almacén.',
        'success'
      );
    END IF;
  END IF;

  RETURN v_vintar_code;
END;
$$;

-- -------------------------------------------------------
-- 2d. registrar_salida_almacen (with frozen CPP capture)
--     Captures the current CPP BEFORE decrementing stock
-- -------------------------------------------------------

-- First: drop all existing overloads to avoid ambiguity
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS func_signature
             FROM pg_proc
             WHERE proname = 'registrar_salida_almacen'
             AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION registrar_salida_almacen(
  p_material_id UUID DEFAULT NULL,
  p_cantidad NUMERIC DEFAULT 0,
  p_destino TEXT DEFAULT NULL,
  p_solicitante TEXT DEFAULT NULL,
  p_obra_id UUID DEFAULT NULL,
  p_equipo_id UUID DEFAULT NULL,
  p_epp_id UUID DEFAULT NULL,
  p_tercero_id UUID DEFAULT NULL,
  p_encargado_id UUID DEFAULT NULL,
  p_bloque_id UUID DEFAULT NULL,
  p_numero_vale TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock_actual NUMERIC;
  v_cpp_actual NUMERIC;
BEGIN
    -- Validate exactly one item ID
    IF (CASE WHEN p_material_id IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN p_equipo_id IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN p_epp_id IS NOT NULL THEN 1 ELSE 0 END) <> 1 THEN
        RAISE EXCEPTION 'Debe especificar exactamente un ID de ítem (Material, Equipo o EPP).';
    END IF;

    -- 1. CAPTURE current stock AND CPP (before any changes)
    SELECT cantidad_actual, COALESCE(costo_promedio, 0) INTO v_stock_actual, v_cpp_actual
    FROM inventario_obra
    WHERE obra_id = p_obra_id
      AND (
        (p_material_id IS NOT NULL AND material_id = p_material_id) OR
        (p_equipo_id IS NOT NULL AND equipo_id = p_equipo_id) OR
        (p_epp_id IS NOT NULL AND epp_id = p_epp_id)
      );

    IF v_stock_actual IS NULL OR v_stock_actual < p_cantidad THEN
         RAISE EXCEPTION 'Stock insuficiente en almacén.';
    END IF;

    -- 2. Update inventory (decrement stock, CPP stays the same on exit)
    UPDATE inventario_obra
    SET cantidad_actual = cantidad_actual - p_cantidad,
        updated_at = NOW()
    WHERE obra_id = p_obra_id
      AND (
        (p_material_id IS NOT NULL AND material_id = p_material_id) OR
        (p_equipo_id IS NOT NULL AND equipo_id = p_equipo_id) OR
        (p_epp_id IS NOT NULL AND epp_id = p_epp_id)
      );

    -- 3. Insert Movement with FROZEN CPP
    INSERT INTO movimientos_almacen (
        obra_id, tipo, material_id, equipo_id, epp_id, cantidad,
        fecha, destino_o_uso, solicitante,
        tercero_id, encargado_id, bloque_id, numero_vale,
        created_at, costo_unitario
    ) VALUES (
        p_obra_id, 'SALIDA', p_material_id, p_equipo_id, p_epp_id, p_cantidad,
        NOW(), p_destino, p_solicitante,
        p_tercero_id, p_encargado_id, p_bloque_id, p_numero_vale,
        NOW(), v_cpp_actual
    );

    -- 4. Audit
    INSERT INTO historial_costos (obra_id, material_id, equipo_id, epp_id, costo_promedio_antes, costo_promedio_despues, movimiento_tipo, cantidad, precio_unitario_usado)
    VALUES (p_obra_id, p_material_id, p_equipo_id, p_epp_id, v_cpp_actual, v_cpp_actual, 'SALIDA', p_cantidad, v_cpp_actual);

END;
$$;
