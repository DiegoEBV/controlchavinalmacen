-- Actualizar función actualizar_pedido_salida para que acepte p_solicitante_id
CREATE OR REPLACE FUNCTION public.actualizar_pedido_salida(
    p_pedido_id UUID,
    p_destino TEXT,
    p_bloque_id UUID,
    p_tercero_id UUID,
    p_encargado_id UUID,
    p_solicitante_id UUID,
    p_items JSONB -- [{ material_id, equipo_id, epp_id, cantidad }]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item JSONB;
BEGIN
    -- 1. Actualizar cabecera del pedido
    UPDATE public.pedidos_salida
    SET 
        destino_o_uso = p_destino,
        bloque_id = p_bloque_id,
        tercero_id = p_tercero_id,
        encargado_id = p_encargado_id,
        solicitante_id = p_solicitante_id,
        updated_at = NOW()
    WHERE id = p_pedido_id AND estado = 'Pendiente';

    -- 2. Eliminar detalles antiguos
    DELETE FROM public.pedidos_salida_detalle WHERE pedido_id = p_pedido_id;

    -- 3. Insertar nuevos detalles
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO public.pedidos_salida_detalle (
            pedido_id,
            material_id,
            equipo_id,
            epp_id,
            cantidad_solicitada,
            cantidad_entregada
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
