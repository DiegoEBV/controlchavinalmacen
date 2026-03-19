-- Script para reparar la relación faltante entre detalles_sc y detalles_requerimiento
-- Esto sucede en registros antiguos creados antes de que la vinculación fuera obligatoria en el código.

DO $$
DECLARE
    r RECORD;
    target_id UUID;
    match_count INTEGER;
BEGIN
    FOR r IN 
        SELECT dsc.id as dsc_id, sc.requerimiento_id, dsc.material_id, dsc.equipo_id, dsc.epp_id
        FROM detalles_sc dsc
        JOIN solicitudes_compra sc ON dsc.sc_id = sc.id
        WHERE dsc.detalle_requerimiento_id IS NULL
    LOOP
        -- Intentar encontrar el detalle de requerimiento correspondiente
        SELECT id, count(*) OVER() INTO target_id, match_count
        FROM detalles_requerimiento
        WHERE requerimiento_id = r.requerimiento_id
          AND (
            (r.material_id IS NOT NULL AND material_id = r.material_id) OR
            (r.equipo_id IS NOT NULL AND equipo_id = r.equipo_id) OR
            (r.epp_id IS NOT NULL AND epp_id = r.epp_id)
          )
        LIMIT 1;

        -- Solo actualizar si hay una coincidencia única para evitar errores en materiales duplicados
        IF target_id IS NOT NULL AND match_count = 1 THEN
            UPDATE detalles_sc
            SET detalle_requerimiento_id = target_id
            WHERE id = r.dsc_id;
        END IF;
    END LOOP;
END $$;
