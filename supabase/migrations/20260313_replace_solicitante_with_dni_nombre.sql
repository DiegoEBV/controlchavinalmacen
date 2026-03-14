-- Migration: Cambiar solicitante_id a solicitante_dni y solicitante_nombre
-- En lugar de usar un ID de usuario registrado, el "Retirado por" será texto libre (obrero/externo)

-- 1. Modificar la tabla pedidos_salida
ALTER TABLE public.pedidos_salida
DROP CONSTRAINT IF EXISTS pedidos_salida_solicitante_id_fkey;

ALTER TABLE public.pedidos_salida
ADD COLUMN IF NOT EXISTS solicitante_dni TEXT,
ADD COLUMN IF NOT EXISTS solicitante_nombre TEXT;

-- Opcional: Eliminar la columna solicitante_id si ya no se usa, o dejarla temporalmente
-- ALTER TABLE public.pedidos_salida DROP COLUMN IF EXISTS solicitante_id;


-- 2. Actualizar función crear_pedido_salida
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
    v_item JSONB;
BEGIN
    -- Generar número de vale (P-YYYY-XXXX)
    INSERT INTO public.counters (key, value)
    VALUES ('pedido_salida_' || p_obra_id, 1)
    ON CONFLICT (key) DO UPDATE SET value = public.counters.value + 1
    RETURNING value INTO v_count;

    v_vale_num := 'P-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(v_count::TEXT, 4, '0');

    -- Insert Header
    INSERT INTO public.pedidos_salida (
        obra_id, solicitante_dni, solicitante_nombre, encargado_id, numero_vale, destino_o_uso, bloque_id, tercero_id
    ) VALUES (
        p_obra_id, p_solicitante_dni, p_solicitante_nombre, p_encargado_id, v_vale_num, p_destino, p_bloque_id, p_tercero_id
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


-- 3. Actualizar función actualizar_pedido_salida
CREATE OR REPLACE FUNCTION public.actualizar_pedido_salida(
    p_pedido_id UUID,
    p_destino TEXT,
    p_bloque_id UUID,
    p_tercero_id UUID,
    p_encargado_id UUID,
    p_solicitante_dni TEXT,
    p_solicitante_nombre TEXT,
    p_items JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item JSONB;
BEGIN
    UPDATE public.pedidos_salida
    SET 
        destino_o_uso = p_destino,
        bloque_id = p_bloque_id,
        tercero_id = p_tercero_id,
        encargado_id = p_encargado_id,
        solicitante_dni = p_solicitante_dni,
        solicitante_nombre = p_solicitante_nombre,
        updated_at = NOW()
    WHERE id = p_pedido_id AND estado = 'Pendiente';

    DELETE FROM public.pedidos_salida_detalle WHERE pedido_id = p_pedido_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO public.pedidos_salida_detalle (
            pedido_id, material_id, equipo_id, epp_id, cantidad_solicitada, cantidad_entregada
        ) VALUES (
            p_pedido_id,
            (v_item->>'material_id')::UUID,
            (v_item->>'equipo_id')::UUID,
            (v_item->>'epp_id')::UUID,
            (v_item->>'cantidad')::NUMERIC,
            0
        );
    END LOOP;
END;
$$;
