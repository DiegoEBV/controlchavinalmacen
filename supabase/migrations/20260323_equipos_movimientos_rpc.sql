-- Add column to differentiate between catalog/insumos and physical units
ALTER TABLE equipos ADD COLUMN IF NOT EXISTS es_unidad_fisica BOOLEAN DEFAULT FALSE;

-- Function to safely register an equipment assignment preventing race conditions
CREATE OR REPLACE FUNCTION registrar_salida_equipo(
    p_equipo_id UUID,
    p_usuario_autoriza_id UUID,
    p_bloque_destino TEXT,
    p_fecha_retorno_estimada TIMESTAMP WITH TIME ZONE,
    p_nombre_solicitante TEXT,
    p_encargado_id UUID
) RETURNS json AS $$
DECLARE
    v_estado_actual TEXT;
    v_movimiento_id UUID;
BEGIN
    -- Verify current status and lock the row to avoid race conditions
    SELECT estado INTO v_estado_actual
    FROM equipos
    WHERE id = p_equipo_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Equipo no encontrado';
    END IF;

    IF v_estado_actual != 'Operativo' THEN
        RAISE EXCEPTION 'El equipo no está Operativo (Estado actual: %)', v_estado_actual;
    END IF;

    -- Insert movement
    INSERT INTO movimientos_equipos (
        equipo_id,
        usuario_autoriza_id,
        bloque_destino,
        fecha_salida,
        fecha_retorno_estimada,
        nombre_solicitante,
        encargado_id
    ) VALUES (
        p_equipo_id,
        p_usuario_autoriza_id,
        p_bloque_destino,
        now(),
        p_fecha_retorno_estimada,
        p_nombre_solicitante,
        p_encargado_id
    ) RETURNING id INTO v_movimiento_id;
    
    -- Explicitly update the equipment status to 'En Uso'
    -- (This guarantees the state change even if the trigger fails or is missing)
    UPDATE equipos 
    SET estado = 'En Uso' 
    WHERE id = p_equipo_id;

    RETURN json_build_object('success', true, 'movimiento_id', v_movimiento_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Function to register equipment return
CREATE OR REPLACE FUNCTION registrar_retorno_equipo(
    p_movimiento_id UUID,
    p_estado_retorno TEXT
) RETURNS json AS $$
DECLARE
    v_equipo_id UUID;
BEGIN
    -- Lock the movement row
    SELECT equipo_id INTO v_equipo_id
    FROM movimientos_equipos
    WHERE id = p_movimiento_id AND fecha_retorno_real IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Movimiento no encontrado o ya retornado';
    END IF;

    -- Update movement
    UPDATE movimientos_equipos
    SET 
        fecha_retorno_real = now(),
        estado_retorno = p_estado_retorno
    WHERE id = p_movimiento_id;

    -- Set equipment back to Operativo (or Inoperativo based on condition, but let's assume Operativo by default, unless specified)
    IF p_estado_retorno = 'Malo' OR p_estado_retorno = 'Inoperativo' THEN
        UPDATE equipos SET estado = 'Inoperativo' WHERE id = v_equipo_id;
    ELSE
        UPDATE equipos SET estado = 'Operativo' WHERE id = v_equipo_id;
    END IF;

    RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- View for the frontend to easily fetch equipment status and semaphores
CREATE OR REPLACE VIEW vw_equipos_estado AS
SELECT 
    e.id,
    e.obra_id,
    e.nombre,
    e.codigo,
    e.marca,
    e.estado,
    e.fecha_adquisicion,
    m.id as movimiento_id,
    m.encargado_id,
    p.nombre as encargado_nombre,
    p.role as encargado_role,
    m.bloque_destino,
    m.fecha_salida,
    m.fecha_retorno_estimada,
    CASE 
        WHEN e.estado = 'En Uso' AND m.fecha_retorno_estimada < now() THEN 'ROJO'
        WHEN e.estado IN ('Inoperativo', 'En Taller') THEN 'AMARILLO'
        WHEN e.estado = 'En Uso' THEN 'AZUL'
        WHEN e.estado = 'Operativo' THEN 'VERDE'
        ELSE 'GRIS'
    END as color_alerta
FROM equipos e
LEFT JOIN LATERAL (
    SELECT id, encargado_id, bloque_destino, fecha_salida, fecha_retorno_estimada
    FROM movimientos_equipos me
    WHERE me.equipo_id = e.id AND me.fecha_retorno_real IS NULL
    ORDER BY me.fecha_salida DESC
    LIMIT 1
) m ON true
LEFT JOIN profiles p ON p.id = m.encargado_id
WHERE e.es_unidad_fisica = TRUE;
