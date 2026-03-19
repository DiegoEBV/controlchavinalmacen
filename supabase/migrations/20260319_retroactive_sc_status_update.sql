-- Ejecutar esto en el SQL Editor para actualizar TODAS las Solicitudes de Compra y sus Detalles antiguos.
DO $$
DECLARE
    v_sc RECORD;
    v_detalle RECORD;
    v_consumed NUMERIC;
    v_all_attended BOOLEAN;
BEGIN
    -- 1. Actualiza el estado de detalle_sc
    FOR v_detalle IN SELECT id, sc_id, cantidad FROM detalles_sc
    LOOP
        SELECT coalesce(sum(cantidad), 0) INTO v_consumed 
        FROM movimientos_almacen 
        WHERE detalle_sc_id = v_detalle.id;

        IF v_consumed >= v_detalle.cantidad THEN
            UPDATE detalles_sc SET estado = 'Atendido' WHERE id = v_detalle.id AND estado != 'Atendido';
        ELSIF v_consumed > 0 THEN
            UPDATE detalles_sc SET estado = 'Parcial' WHERE id = v_detalle.id AND estado != 'Parcial';
        END IF;
    END LOOP;

    -- 2. Actualizar el estado de la cabecera (solicitudes_compra)
    FOR v_sc IN SELECT id, estado FROM solicitudes_compra WHERE estado != 'Anulada'
    LOOP
        -- Check if all details are 'Atendido' or 'Anulado'
        SELECT NOT EXISTS (
            SELECT 1 FROM detalles_sc 
            WHERE sc_id = v_sc.id AND estado NOT IN ('Atendido', 'Anulado')
        ) INTO v_all_attended;

        -- We also check if it has AT LEAST ONE detail
        IF v_all_attended AND EXISTS (SELECT 1 FROM detalles_sc WHERE sc_id = v_sc.id) THEN
            UPDATE solicitudes_compra SET estado = 'Atendida' WHERE id = v_sc.id AND estado != 'Atendida';
        ELSE
            -- Si alguno es Parcial o Atendido (pero no todos), pasa a Parcial
            IF EXISTS (
                SELECT 1 FROM detalles_sc 
                WHERE sc_id = v_sc.id AND estado IN ('Parcial', 'Atendido')
            ) THEN
                UPDATE solicitudes_compra SET estado = 'Parcial' WHERE id = v_sc.id AND estado != 'Parcial';
            END IF;
        END IF;
    END LOOP;

    -- 3. Actualizar el estado de la cabecera (ordenes_compra)
    FOR v_sc IN SELECT id, estado FROM ordenes_compra WHERE estado != 'Anulada'
    LOOP
        SELECT NOT EXISTS (
            SELECT 1 FROM detalles_oc doc
            WHERE doc.oc_id = v_sc.id
            AND doc.cantidad > (
                SELECT COALESCE(SUM(m.cantidad), 0)
                FROM movimientos_almacen m
                WHERE m.orden_compra_id = v_sc.id 
                AND m.detalle_sc_id = doc.detalle_sc_id
            )
        ) INTO v_all_attended;

        IF v_all_attended AND EXISTS (SELECT 1 FROM detalles_oc WHERE oc_id = v_sc.id) THEN
            UPDATE ordenes_compra SET estado = 'Recepcionada' WHERE id = v_sc.id AND estado != 'Recepcionada';
        ELSE
            IF EXISTS (
                SELECT 1 FROM movimientos_almacen WHERE orden_compra_id = v_sc.id
            ) THEN
                UPDATE ordenes_compra SET estado = 'Parcial' WHERE id = v_sc.id AND estado != 'Parcial';
            END IF;
        END IF;
    END LOOP;
END $$;
