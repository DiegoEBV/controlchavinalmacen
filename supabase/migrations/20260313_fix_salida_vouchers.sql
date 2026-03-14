-- Migration: Fix Salida Vouchers while preserving CPP and Cost Auditing

-- 1. Create Peek function for UI (ReadOnly)
CREATE OR REPLACE FUNCTION public.get_peek_vale_salida(p_obra_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count INT;
    v_year TEXT;
BEGIN
    v_year := TO_CHAR(NOW(), 'YYYY');

    -- Just get the current value without incrementing
    SELECT value INTO v_count
    FROM public.counters
    WHERE key = 'vale_salida_' || p_obra_id || '_' || v_year;

    -- Return next number (current + 1) or 1 if not exists
    RETURN 'V-' || v_year || '-' || LPAD((COALESCE(v_count, 0) + 1)::TEXT, 4, '0');
END;
$$;

-- 2. Update crear_pedido_salida to use the SAME sequence (V-YYYY-XXXX)
CREATE OR REPLACE FUNCTION public.crear_pedido_salida(
    p_obra_id UUID,
    p_solicitante_id UUID,
    p_encargado_id UUID,
    p_destino TEXT,
    p_bloque_id UUID,
    p_tercero_id UUID,
    p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pedido_id UUID;
    v_vale_num TEXT;
    v_count INT;
    v_year TEXT;
    v_item JSONB;
BEGIN
    v_year := TO_CHAR(NOW(), 'YYYY');

    -- Atomic generation of voucher number using the shared 'vale_salida_' counter
    INSERT INTO public.counters (key, value)
    VALUES ('vale_salida_' || p_obra_id || '_' || v_year, 1)
    ON CONFLICT (key) DO UPDATE SET value = public.counters.value + 1
    RETURNING value INTO v_count;

    v_vale_num := 'V-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');

    -- Insert Header
    INSERT INTO public.pedidos_salida (
        obra_id, solicitante_id, encargado_id, numero_vale, destino_o_uso, bloque_id, tercero_id
    ) VALUES (
        p_obra_id, p_solicitante_id, p_encargado_id, v_vale_num, p_destino, p_bloque_id, p_tercero_id
    ) RETURNING id INTO v_pedido_id;

    -- Insert Details
    FOR v_item IN SELECT * FROM JSONB_ARRAY_ELEMENTS(p_items)
    LOOP
        INSERT INTO public.pedidos_salida_detalle (
            pedido_id, material_id, equipo_id, epp_id, cantidad_solicitada
        ) VALUES (
            v_pedido_id,
            (v_item->>'material_id')::UUID,
            (v_item->>'equipo_id')::UUID,
            (v_item->>'epp_id')::UUID,
            (v_item->>'cantidad')::NUMERIC
        );
    END LOOP;

    RETURN JSONB_BUILD_OBJECT('id', v_pedido_id, 'numero_vale', v_vale_num);
END;
$$;


-- 3. Update registrar_salida_almacen to Merge CPP/Auditing with Auto-Voucher
CREATE OR REPLACE FUNCTION public.registrar_salida_almacen(
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
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stock_actual NUMERIC;
  v_cpp_actual NUMERIC;
  v_final_vale TEXT;
  v_year TEXT;
  v_count INT;
BEGIN
    -- Validate exactly one item ID
    IF (CASE WHEN p_material_id IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN p_equipo_id IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN p_epp_id IS NOT NULL THEN 1 ELSE 0 END) <> 1 THEN
        RAISE EXCEPTION 'Debe especificar exactamente un ID de ítem (Material, Equipo o EPP).';
    END IF;

    -- Handle Voucher Number Generation if NULL or empty
    v_final_vale := p_numero_vale;
    IF v_final_vale IS NULL OR v_final_vale = '' THEN
        v_year := TO_CHAR(NOW(), 'YYYY');
        INSERT INTO public.counters (key, value)
        VALUES ('vale_salida_' || p_obra_id || '_' || v_year, 1)
        ON CONFLICT (key) DO UPDATE SET value = public.counters.value + 1
        RETURNING value INTO v_count;
        
        v_final_vale := 'V-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
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

    -- 3. Insert Movement with FROZEN CPP and the resolved v_final_vale
    INSERT INTO movimientos_almacen (
        obra_id, tipo, material_id, equipo_id, epp_id, cantidad,
        fecha, destino_o_uso, solicitante,
        tercero_id, encargado_id, bloque_id, numero_vale,
        created_at, costo_unitario
    ) VALUES (
        p_obra_id, 'SALIDA', p_material_id, p_equipo_id, p_epp_id, p_cantidad,
        NOW(), p_destino, p_solicitante,
        p_tercero_id, p_encargado_id, p_bloque_id, v_final_vale,
        NOW(), v_cpp_actual
    );

    -- 4. Audit
    INSERT INTO historial_costos (obra_id, material_id, equipo_id, epp_id, costo_promedio_antes, costo_promedio_despues, movimiento_tipo, cantidad, precio_unitario_usado)
    VALUES (p_obra_id, p_material_id, p_equipo_id, p_epp_id, v_cpp_actual, v_cpp_actual, 'SALIDA', p_cantidad, v_cpp_actual);

    -- Return the generated/used voucher number
    RETURN v_final_vale;
END;
$$;
