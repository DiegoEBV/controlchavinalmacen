-- 1. Eliminar columna obsoleta y limpiar tabla movimentos_almacen
ALTER TABLE public.pedidos_salida DROP COLUMN IF EXISTS solicitante_id;

-- Agregar DNI a movimientos si no existe (para trazabilidad completa)
ALTER TABLE public.movimientos_almacen ADD COLUMN IF NOT EXISTS solicitante_dni TEXT;

-- 2. Asegurar que las políticas de RLS no dependan de solicitante_id
-- (Ya lo hicimos permisivo en las migraciones anteriores, pero es bueno verificar)

-- 3. Actualizar función crear_pedido_salida (Versión Final Unificada)
CREATE OR REPLACE FUNCTION public.crear_pedido_salida(
    p_obra_id UUID,
    p_solicitante_dni TEXT,
    p_solicitante_nombre TEXT,
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

    -- Atomic generation of voucher number using THE SAME SHARED counter
    INSERT INTO public.counters (key, value)
    VALUES ('vale_salida_' || p_obra_id || '_' || v_year, 1)
    ON CONFLICT (key) DO UPDATE SET value = public.counters.value + 1
    RETURNING value INTO v_count;

    v_vale_num := 'V-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');

    INSERT INTO public.pedidos_salida (
        obra_id, solicitante_dni, solicitante_nombre, encargado_id, numero_vale, estado, destino_o_uso, bloque_id, tercero_id
    ) VALUES (
        p_obra_id, p_solicitante_dni, p_solicitante_nombre, p_encargado_id, v_vale_num, 'Pendiente', p_destino, p_bloque_id, p_tercero_id
    ) RETURNING id INTO v_pedido_id;

    FOR v_item IN SELECT * FROM JSONB_ARRAY_ELEMENTS(p_items)
    LOOP
        INSERT INTO public.pedidos_salida_detalle (
            pedido_id, material_id, equipo_id, epp_id, cantidad_solicitada, cantidad_entregada
        ) VALUES (
            v_pedido_id,
            (v_item->>'material_id')::UUID,
            (v_item->>'equipo_id')::UUID,
            (v_item->>'epp_id')::UUID,
            (v_item->>'cantidad')::NUMERIC,
            0
        );
    END LOOP;

    RETURN JSONB_BUILD_OBJECT('id', v_pedido_id, 'numero_vale', v_vale_num);
END;
$$;

-- 4. Actualizar registrar_salida_almacen para incluir DNI
CREATE OR REPLACE FUNCTION public.registrar_salida_almacen(
    p_tipo TEXT,
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
AS $$
DECLARE
    v_stock_actual NUMERIC;
BEGIN
    -- 1. Verificar stock
    SELECT cantidad_actual INTO v_stock_actual
    FROM public.inventario_obra
    WHERE obra_id = p_obra_id
      AND (
          (p_tipo = 'MATERIAL' AND material_id = p_item_id) OR
          (p_tipo = 'EQUIPO' AND equipo_id = p_item_id) OR
          (p_tipo = 'EPP' AND epp_id = p_item_id)
      );

    IF v_stock_actual < p_cantidad THEN
        RAISE EXCEPTION 'Stock insuficiente para esta operación';
    END IF;

    -- 2. Insertar movimiento (con el nuevo campo DNI)
    INSERT INTO public.movimientos_almacen (
        obra_id, tipo, material_id, equipo_id, epp_id, cantidad, fecha,
        solicitante, solicitante_dni, destino_o_uso, tercero_id, encargado_id, bloque_id, numero_vale
    ) VALUES (
        p_obra_id, 'SALIDA',
        CASE WHEN p_tipo = 'MATERIAL' THEN p_item_id ELSE NULL END,
        CASE WHEN p_tipo = 'EQUIPO' THEN p_item_id ELSE NULL END,
        CASE WHEN p_tipo = 'EPP' THEN p_item_id ELSE NULL END,
        p_cantidad, NOW(),
        p_solicitante, p_solicitante_dni, p_destino, p_tercero_id, p_encargado_id, p_bloque_id, p_vale
    );

    -- 3. Actualizar Inventario se hará vía trigger (ya existente en la base de datos)
END;
$$;
