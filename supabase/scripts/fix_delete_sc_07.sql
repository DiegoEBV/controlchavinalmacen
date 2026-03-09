-- SCRIPT PARA ELIMINAR SC-2026-007 Y REVERTIR CAMBIOS EN REQUERIMIENTO
-- Este script:
-- 1. Identifica la SC por su número correlativo.
-- 2. Revierte la 'cantidad_atendida' en los detalles del requerimiento si se procesó de forma directa (Skip OC).
-- 3. Elimina los ítems de la SC.
-- 4. Elimina la cabecera de la SC.

DO $$
DECLARE
    v_sc_numero TEXT := 'SC-2026-007';
    v_sc_id UUID;
    v_item RECORD;
BEGIN
    -- 1. Obtener ID de la SC
    SELECT id INTO v_sc_id FROM public.solicitudes_compra WHERE numero_sc = v_sc_numero;

    IF v_sc_id IS NULL THEN
        RAISE NOTICE 'No se encontró la SC con número %', v_sc_numero;
        RETURN;
    END IF;

    -- 2. Revertir cantidades en detalles_requerimiento
    FOR v_item IN 
        SELECT dsc.detalle_requerimiento_id, dsc.cantidad, dsc.procesado_directo
        FROM public.detalles_sc dsc
        WHERE dsc.sc_id = v_sc_id
    LOOP
        IF v_item.procesado_directo = TRUE THEN
            UPDATE public.detalles_requerimiento
            SET cantidad_atendida = GREATEST(0, COALESCE(cantidad_atendida, 0) - v_item.cantidad),
                estado = 'Parcial' -- Siempre lo regresamos a Parcial o Pendiente para seguridad
            WHERE id = v_item.detalle_requerimiento_id;
            
            -- Re-calcular estado si quedó en 0
            UPDATE public.detalles_requerimiento
            SET estado = CASE WHEN cantidad_atendida <= 0 THEN 'Pendiente' ELSE 'Parcial' END
            WHERE id = v_item.detalle_requerimiento_id;
        END IF;
    END LOOP;

    -- 3. Eliminar Detalles de SC
    DELETE FROM public.detalles_sc WHERE sc_id = v_sc_id;

    -- 4. Eliminar Cabecera de SC
    DELETE FROM public.solicitudes_compra WHERE id = v_sc_id;

    RAISE NOTICE 'SC % eliminada exitosamente y requerimientos actualizados.', v_sc_numero;

END $$;
