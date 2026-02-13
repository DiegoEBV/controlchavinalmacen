-- Función para actualizar un requerimiento completo de manera atómica
-- Maneja: Validación de SC existente, Actualización de Cabecera, Eliminación de Ítems huérfanos, Upsert de Ítems

CREATE OR REPLACE FUNCTION actualizar_requerimiento_completo(
    p_req_id UUID,
    p_cabecera JSONB,
    p_detalles JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_item JSONB;
    v_detalle_id UUID;
    v_current_ids UUID[];
    v_new_ids UUID[];
BEGIN
    -- 1. VALIDACIÓN: Verificar si ya existe una Solicitud de Compra (SC)
    IF EXISTS (SELECT 1 FROM solicitudes_compra WHERE requerimiento_id = p_req_id) THEN
        RAISE EXCEPTION 'No se puede editar un requerimiento que ya tiene una Solicitud de Compra generada.';
    END IF;

    -- 2. ACTUALIZAR CABECERA
    UPDATE requerimientos
    SET
        frente_id = (p_cabecera->>'frente_id')::UUID,
        bloque = p_cabecera->>'bloque',
        especialidad = p_cabecera->>'especialidad',
        solicitante = p_cabecera->>'solicitante'
        -- No actualizamos obra_id ni item_correlativo normalmente, pero si fuera necesario se agrega aqui
    WHERE id = p_req_id;

    -- 3. GESTIÓN DE DETALLES (ÍTEMS)

    -- Obtener IDs actuales en la base de datos para este requerimiento
    SELECT ARRAY_AGG(id) INTO v_current_ids
    FROM detalles_requerimiento
    WHERE requerimiento_id = p_req_id;

    -- Obtener IDs que vienen en el payload (solo los que no son null)
    SELECT ARRAY_AGG((item->>'id')::UUID) INTO v_new_ids
    FROM jsonb_array_elements(p_detalles) AS item
    WHERE item->>'id' IS NOT NULL;

    -- 3.1. ELIMINAR Ítems que están en DB pero NO en el payload
    IF v_current_ids IS NOT NULL THEN
        DELETE FROM detalles_requerimiento
        WHERE requerimiento_id = p_req_id
        AND id = ANY(v_current_ids)
        AND (v_new_ids IS NULL OR id != ALL(v_new_ids));
    END IF;

    -- 3.2. UPSERT (Insertar o Actualizar) Ítems
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_detalles)
    LOOP
        IF (v_item->>'id') IS NOT NULL AND (v_item->>'id') != '' THEN
            -- UPDATE existente
            UPDATE detalles_requerimiento
            SET
                tipo = v_item->>'tipo',
                material_categoria = v_item->>'material_categoria',
                descripcion = v_item->>'descripcion',
                unidad = v_item->>'unidad',
                cantidad_solicitada = (v_item->>'cantidad_solicitada')::NUMERIC
            WHERE id = (v_item->>'id')::UUID;
        ELSE
            -- INSERT nuevo
            INSERT INTO detalles_requerimiento (
                requerimiento_id,
                tipo,
                material_categoria,
                descripcion,
                unidad,
                cantidad_solicitada,
                cantidad_atendida,
                estado
            ) VALUES (
                p_req_id,
                v_item->>'tipo',
                v_item->>'material_categoria',
                v_item->>'descripcion',
                v_item->>'unidad',
                (v_item->>'cantidad_solicitada')::NUMERIC,
                0, -- Inicializar atentida
                'Pendiente' -- Inicializar estado
            );
        END IF;
    END LOOP;

END;
$$;
