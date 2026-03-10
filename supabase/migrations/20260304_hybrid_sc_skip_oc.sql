DECLARE
    item RECORD;
BEGIN
    -- Seguridad: Solo permitir ejecución a usuarios autenticados
    IF auth.role() <> 'authenticated' THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    FOR item IN 
        SELECT id, detalle_requerimiento_id, cantidad, enviar_a_oc 
        FROM public.detalles_sc
        WHERE sc_id = p_sc_id
    LOOP
        -- SI EL ITEM NO VA A OC, LO MARCAMOS COMO procesado_directo
        IF item.enviar_a_oc = FALSE THEN
            UPDATE public.detalles_sc
            SET estado = 'Pendiente', 
                procesado_directo = TRUE
            WHERE id = item.id;
        END IF;
    END LOOP;

    -- 3. Si todos los ítems son Skip OC, marcar cabecera SC como Atendida (pues Logística terminó su parte)
    IF NOT EXISTS (SELECT 1 FROM public.detalles_sc WHERE sc_id = p_sc_id AND enviar_a_oc = TRUE) THEN
        UPDATE public.solicitudes_compra SET estado = 'Pendiente' WHERE id = p_sc_id;
    END IF;
END;