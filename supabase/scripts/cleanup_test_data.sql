-- SCRIPT DE LIMPIEZA PARA PRUEBAS
-- Este script borra un requerimiento y toda su trazabilidad (SC, OC, Movimientos)
-- Esto permite que el correlativo (Req #) se pueda volver a usar.

DO $$
DECLARE
    -- CAMBIA ESTE ID por el UUID que desees eliminar
    v_req_id UUID := 'TU_ID_AQUI'; 
    
    v_sc_ids UUID[];
    v_oc_ids UUID[];
BEGIN
    -- 1. Obtener IDs de SCs y OCs relacionadas
    SELECT array_agg(id) INTO v_sc_ids FROM public.solicitudes_compra WHERE requerimiento_id = v_req_id;
    IF v_sc_ids IS NOT NULL THEN
        SELECT array_agg(id) INTO v_oc_ids FROM public.ordenes_compra WHERE sc_id = ANY(v_sc_ids);
    END IF;

    -- 2. Borrar en orden inverso de dependencia
    
    -- Detalles de OC
    IF v_oc_ids IS NOT NULL THEN
        DELETE FROM public.detalles_oc WHERE oc_id = ANY(v_oc_ids);
    END IF;

    -- Cabeceras de OC
    IF v_oc_ids IS NOT NULL THEN
        DELETE FROM public.ordenes_compra WHERE id = ANY(v_oc_ids);
    END IF;

    -- Detalles de SC
    IF v_sc_ids IS NOT NULL THEN
        DELETE FROM public.detalles_sc WHERE sc_id = ANY(v_sc_ids);
    END IF;

    -- Cabeceras de SC
    DELETE FROM public.solicitudes_compra WHERE requerimiento_id = v_req_id;

    -- Movimientos de Almacén vinculados
    DELETE FROM public.movimientos_almacen WHERE requerimiento_id = v_req_id;

    -- Detalles de Requerimiento
    DELETE FROM public.detalles_requerimiento WHERE requerimiento_id = v_req_id;

    -- Finalmente, el Requerimiento
    DELETE FROM public.requerimientos WHERE id = v_req_id;

    RAISE NOTICE 'Requerimiento % y toda su trazabilidad eliminada correctamente.', v_req_id;
END $$;
