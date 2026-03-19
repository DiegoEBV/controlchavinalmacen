-- Migration: Fix Unified Warehouse RPC Functions
-- Unifies registrar_entrada_almacen and registrar_salida_almacen to use p_tipo and p_item_id
-- to match the frontend call pattern, while preserving CPP (Costo Promedio Ponderado) logic.

-- 1. CLEANUP ALL EXISTING OVERLOADS
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT oid::regprocedure as sig FROM pg_proc WHERE proname = 'registrar_entrada_almacen') LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
    END LOOP;
    
    FOR r IN (SELECT oid::regprocedure as sig FROM pg_proc WHERE proname = 'registrar_salida_almacen') LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
    END LOOP;
END $$;

-- 2. UNIFIED ENTRADA ALMACEN
CREATE OR REPLACE FUNCTION public.registrar_entrada_almacen(
  p_tipo TEXT, -- 'MATERIAL', 'EQUIPO', 'EPP'
  p_item_id UUID,
  p_cantidad NUMERIC,
  p_guia TEXT,
  p_obra_id UUID,
  p_req_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_material_id UUID := NULL;
    v_equipo_id UUID := NULL;
    v_epp_id UUID := NULL;
    v_cpp_antes NUMERIC;
    v_stock_antes NUMERIC;
    v_cpp_nuevo NUMERIC;
    v_precio_unitario NUMERIC := 0; 
BEGIN
    -- Map unified ID based on type
    IF p_tipo = 'MATERIAL' THEN v_material_id := p_item_id;
    ELSIF p_tipo = 'EQUIPO' THEN v_equipo_id := p_item_id;
    ELSIF p_tipo = 'EPP' THEN v_epp_id := p_item_id;
    ELSE RAISE EXCEPTION 'Tipo de ítem inválido: %', p_tipo;
    END IF;

    -- 1. Get current stock and CPP
    IF v_material_id IS NOT NULL THEN
        SELECT cantidad_actual, COALESCE(costo_promedio, 0) INTO v_stock_antes, v_cpp_antes
        FROM inventario_obra WHERE obra_id = p_obra_id AND material_id = v_material_id;
    ELSIF v_equipo_id IS NOT NULL THEN
        SELECT cantidad_actual, COALESCE(costo_promedio, 0) INTO v_stock_antes, v_cpp_antes
        FROM inventario_obra WHERE obra_id = p_obra_id AND equipo_id = v_equipo_id;
    ELSIF v_epp_id IS NOT NULL THEN
        SELECT cantidad_actual, COALESCE(costo_promedio, 0) INTO v_stock_antes, v_cpp_antes
        FROM inventario_obra WHERE obra_id = p_obra_id AND epp_id = v_epp_id;
    END IF;
    
    v_stock_antes := COALESCE(v_stock_antes, 0);
    v_cpp_antes := COALESCE(v_cpp_antes, 0);

    -- 2. Calculate new CPP
    IF (v_stock_antes + p_cantidad) > 0 THEN
        v_cpp_nuevo := ((v_stock_antes * v_cpp_antes) + (p_cantidad * v_precio_unitario)) / (v_stock_antes + p_cantidad);
    ELSE
        v_cpp_nuevo := v_precio_unitario;
    END IF;

    -- 3. Update Inventory (handling partial indexes correctly)
    IF v_material_id IS NOT NULL THEN
        INSERT INTO inventario_obra (obra_id, material_id, cantidad_actual, costo_promedio, ultimo_ingreso, updated_at)
        VALUES (p_obra_id, v_material_id, p_cantidad, v_cpp_nuevo, now(), now())
        ON CONFLICT (obra_id, material_id) WHERE material_id IS NOT NULL
        DO UPDATE SET 
            cantidad_actual = inventario_obra.cantidad_actual + p_cantidad,
            costo_promedio = v_cpp_nuevo,
            ultimo_ingreso = now(),
            updated_at = now();
    ELSIF v_equipo_id IS NOT NULL THEN
        INSERT INTO inventario_obra (obra_id, equipo_id, cantidad_actual, costo_promedio, ultimo_ingreso, updated_at)
        VALUES (p_obra_id, v_equipo_id, p_cantidad, v_cpp_nuevo, now(), now())
        ON CONFLICT (obra_id, equipo_id) WHERE equipo_id IS NOT NULL
        DO UPDATE SET 
            cantidad_actual = inventario_obra.cantidad_actual + p_cantidad,
            costo_promedio = v_cpp_nuevo,
            ultimo_ingreso = now(),
            updated_at = now();
    ELSIF v_epp_id IS NOT NULL THEN
        INSERT INTO inventario_obra (obra_id, epp_id, cantidad_actual, costo_promedio, ultimo_ingreso, updated_at)
        VALUES (p_obra_id, v_epp_id, p_cantidad, v_cpp_nuevo, now(), now())
        ON CONFLICT (obra_id, epp_id) WHERE epp_id IS NOT NULL
        DO UPDATE SET 
            cantidad_actual = inventario_obra.cantidad_actual + p_cantidad,
            costo_promedio = v_cpp_nuevo,
            ultimo_ingreso = now(),
            updated_at = now();
    END IF;

    -- 4. Insert Movement
    INSERT INTO movimientos_almacen (
        obra_id, tipo, material_id, equipo_id, epp_id, cantidad,
        fecha, documento_referencia, requerimiento_id,
        created_at, costo_unitario
    ) VALUES (
        p_obra_id, 'ENTRADA', v_material_id, v_equipo_id, v_epp_id, p_cantidad,
        now(), p_guia, p_req_id,
        now(), v_precio_unitario
    );

    -- 5. Audit
    INSERT INTO historial_costos (obra_id, material_id, equipo_id, epp_id, costo_promedio_antes, costo_promedio_despues, movimiento_tipo, cantidad, precio_unitario_usado)
    VALUES (p_obra_id, v_material_id, v_equipo_id, v_epp_id, v_cpp_antes, v_cpp_nuevo, 'ENTRADA', p_cantidad, v_precio_unitario);
END;
$$;

-- 3. UNIFIED SALIDA ALMACEN
CREATE OR REPLACE FUNCTION public.registrar_salida_almacen(
  p_tipo TEXT, -- 'MATERIAL', 'EQUIPO', 'EPP'
  p_item_id UUID,
  p_cantidad NUMERIC,
  p_destino TEXT,
  p_solicitante TEXT,
  p_obra_id UUID,
  p_tercero_id UUID DEFAULT NULL,
  p_encargado_id UUID DEFAULT NULL,
  p_bloque_id UUID DEFAULT NULL,
  p_vale TEXT DEFAULT NULL,
  p_solicitante_dni TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_material_id UUID := NULL;
    v_equipo_id UUID := NULL;
    v_epp_id UUID := NULL;
    v_stock_actual NUMERIC;
    v_cpp_actual NUMERIC;
BEGIN
    -- Map unified ID based on type
    IF p_tipo = 'MATERIAL' THEN v_material_id := p_item_id;
    ELSIF p_tipo = 'EQUIPO' THEN v_equipo_id := p_item_id;
    ELSIF p_tipo = 'EPP' THEN v_epp_id := p_item_id;
    ELSE RAISE EXCEPTION 'Tipo de ítem inválido: %', p_tipo;
    END IF;

    -- 1. CAPTURE current stock AND CPP
    IF v_material_id IS NOT NULL THEN
        SELECT cantidad_actual, COALESCE(costo_promedio, 0) INTO v_stock_actual, v_cpp_actual
        FROM inventario_obra WHERE obra_id = p_obra_id AND material_id = v_material_id;
    ELSIF v_equipo_id IS NOT NULL THEN
        SELECT cantidad_actual, COALESCE(costo_promedio, 0) INTO v_stock_actual, v_cpp_actual
        FROM inventario_obra WHERE obra_id = p_obra_id AND equipo_id = v_equipo_id;
    ELSIF v_epp_id IS NOT NULL THEN
        SELECT cantidad_actual, COALESCE(costo_promedio, 0) INTO v_stock_actual, v_cpp_actual
        FROM inventario_obra WHERE obra_id = p_obra_id AND epp_id = v_epp_id;
    END IF;

    IF v_stock_actual IS NULL OR v_stock_actual < p_cantidad THEN
         RAISE EXCEPTION 'Stock insuficiente en almacén.';
    END IF;

    -- 2. Update inventory (decrement stock)
    IF v_material_id IS NOT NULL THEN
        UPDATE inventario_obra SET cantidad_actual = cantidad_actual - p_cantidad, updated_at = NOW()
        WHERE obra_id = p_obra_id AND material_id = v_material_id;
    ELSIF v_equipo_id IS NOT NULL THEN
        UPDATE inventario_obra SET cantidad_actual = cantidad_actual - p_cantidad, updated_at = NOW()
        WHERE obra_id = p_obra_id AND equipo_id = v_equipo_id;
    ELSIF v_epp_id IS NOT NULL THEN
        UPDATE inventario_obra SET cantidad_actual = cantidad_actual - p_cantidad, updated_at = NOW()
        WHERE obra_id = p_obra_id AND epp_id = v_epp_id;
    END IF;

    -- 3. Insert Movement with FROZEN CPP
    INSERT INTO movimientos_almacen (
        obra_id, tipo, material_id, equipo_id, epp_id, cantidad,
        fecha, destino_o_uso, solicitante,
        tercero_id, encargado_id, bloque_id, numero_vale, solicitante_dni,
        created_at, costo_unitario
    ) VALUES (
        p_obra_id, 'SALIDA', v_material_id, v_equipo_id, v_epp_id, p_cantidad,
        NOW(), p_destino, p_solicitante,
        p_tercero_id, p_encargado_id, p_bloque_id, p_vale, p_solicitante_dni,
        NOW(), v_cpp_actual
    );

    -- 4. Audit
    INSERT INTO historial_costos (obra_id, material_id, equipo_id, epp_id, costo_promedio_antes, costo_promedio_despues, movimiento_tipo, cantidad, precio_unitario_usado)
    VALUES (p_obra_id, v_material_id, v_equipo_id, v_epp_id, v_cpp_actual, v_cpp_actual, 'SALIDA', p_cantidad, v_cpp_actual);

END;
$$;
