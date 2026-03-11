-- ========================================================================
-- MIGRATION: Ajuste de Inventario
-- Function to adjust inventory when physical count differs from system
-- ========================================================================

CREATE OR REPLACE FUNCTION registrar_ajuste_inventario(
    p_obra_id UUID,
    p_material_id UUID DEFAULT NULL,
    p_equipo_id UUID DEFAULT NULL,
    p_epp_id UUID DEFAULT NULL,
    p_cantidad_fisica NUMERIC DEFAULT 0,
    p_motivo TEXT DEFAULT 'Ajuste por conteo físico',
    p_usuario TEXT DEFAULT 'Sistema'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stock_sistema NUMERIC;
    v_cpp_actual NUMERIC;
    v_diferencia NUMERIC;
    v_tipo_ajuste TEXT;
BEGIN
    -- Validate exactly one item ID
    IF (CASE WHEN p_material_id IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN p_equipo_id IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN p_epp_id IS NOT NULL THEN 1 ELSE 0 END) <> 1 THEN
        RAISE EXCEPTION 'Debe especificar exactamente un ID de ítem.';
    END IF;

    -- 1. Get current stock and CPP
    SELECT cantidad_actual, COALESCE(costo_promedio, 0)
    INTO v_stock_sistema, v_cpp_actual
    FROM inventario_obra
    WHERE obra_id = p_obra_id
      AND (
        (p_material_id IS NOT NULL AND material_id = p_material_id) OR
        (p_equipo_id IS NOT NULL AND equipo_id = p_equipo_id) OR
        (p_epp_id IS NOT NULL AND epp_id = p_epp_id)
      );

    IF v_stock_sistema IS NULL THEN
        RAISE EXCEPTION 'El ítem no existe en el inventario de esta obra.';
    END IF;

    v_diferencia := p_cantidad_fisica - v_stock_sistema;

    IF v_diferencia = 0 THEN
        RETURN jsonb_build_object('message', 'Sin diferencia. No se registró ajuste.', 'diferencia', 0);
    END IF;

    v_tipo_ajuste := CASE WHEN v_diferencia > 0 THEN 'AJUSTE_ENTRADA' ELSE 'AJUSTE_SALIDA' END;

    -- 2. Update inventory (set to physical count, CPP stays same)
    UPDATE inventario_obra
    SET cantidad_actual = p_cantidad_fisica,
        updated_at = NOW()
    WHERE obra_id = p_obra_id
      AND (
        (p_material_id IS NOT NULL AND material_id = p_material_id) OR
        (p_equipo_id IS NOT NULL AND equipo_id = p_equipo_id) OR
        (p_epp_id IS NOT NULL AND epp_id = p_epp_id)
      );

    -- 3. Insert movement record with frozen CPP
    INSERT INTO movimientos_almacen (
        obra_id, tipo, material_id, equipo_id, epp_id,
        cantidad, fecha, documento_referencia,
        destino_o_uso, solicitante, created_at, costo_unitario
    ) VALUES (
        p_obra_id, v_tipo_ajuste, p_material_id, p_equipo_id, p_epp_id,
        ABS(v_diferencia), NOW(), 'AJUSTE INVENTARIO',
        p_motivo, p_usuario, NOW(), v_cpp_actual
    );

    -- 4. Audit
    INSERT INTO historial_costos (obra_id, material_id, equipo_id, epp_id, costo_promedio_antes, costo_promedio_despues, movimiento_tipo, cantidad, precio_unitario_usado)
    VALUES (p_obra_id, p_material_id, p_equipo_id, p_epp_id, v_cpp_actual, v_cpp_actual, v_tipo_ajuste, ABS(v_diferencia), v_cpp_actual);

    RETURN jsonb_build_object(
        'message', 'Ajuste registrado correctamente.',
        'tipo', v_tipo_ajuste,
        'diferencia', v_diferencia,
        'stock_anterior', v_stock_sistema,
        'stock_nuevo', p_cantidad_fisica
    );
END;
$$;
