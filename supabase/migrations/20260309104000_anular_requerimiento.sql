-- 1. Añadir columna estado y motivo a requerimientos si no existe
ALTER TABLE requerimientos ADD COLUMN IF NOT EXISTS estado VARCHAR(50) DEFAULT 'Activo';
ALTER TABLE requerimientos ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT;

-- Actualizar registros existentes a 'Activo'
UPDATE requerimientos SET estado = 'Activo' WHERE estado IS NULL;

-- 2. Crear función RPC para anular requerimiento
CREATE OR REPLACE FUNCTION anular_requerimiento(p_req_id UUID, p_user_id UUID, p_motivo TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_req_estado VARCHAR;
    v_role VARCHAR;
    v_sc_count INT;
    v_atendidos_count INT;
BEGIN
    -- a. Validar rol del usuario (Admin o Coordinador)
    SELECT role INTO v_role FROM profiles WHERE id = p_user_id;
    IF v_role NOT IN ('admin', 'coordinador') THEN
        RETURN json_build_object('success', false, 'message', 'No tienes permisos para anular requerimientos. Solo Administradores y Coordinadores pueden realizar esta acción.');
    END IF;

    -- b. Validar que el requerimiento exista y no esté ya anulado
    SELECT estado INTO v_req_estado FROM requerimientos WHERE id = p_req_id;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Requerimiento no encontrado.');
    END IF;
    IF v_req_estado = 'Anulado' THEN
        RETURN json_build_object('success', false, 'message', 'El requerimiento ya se encuentra anulado.');
    END IF;

    -- c. Validar que no tenga SC vinculadas
    SELECT count(*) INTO v_sc_count FROM solicitudes_compra WHERE requerimiento_id = p_req_id AND estado != 'Anulada';
    IF v_sc_count > 0 THEN
        RETURN json_build_object('success', false, 'message', 'No se puede anular: Existen Solicitudes de Compra vinculadas a este requerimiento.');
    END IF;

    -- d. Validar que no tenga ítems atendidos
    SELECT count(*) INTO v_atendidos_count 
    FROM detalles_requerimiento 
    WHERE requerimiento_id = p_req_id AND (cantidad_atendida > 0 OR cantidad_caja_chica > 0);
    
    IF v_atendidos_count > 0 THEN
        RETURN json_build_object('success', false, 'message', 'No se puede anular: Existen ítems con atención parcial o total (o por Caja Chica).');
    END IF;

    -- e. Proceder con la anulación lógica (Soft Delete)
    UPDATE requerimientos SET estado = 'Anulado', motivo_anulacion = p_motivo WHERE id = p_req_id;
    
    -- f. Actualizar estado de los detalles a 'Cancelado'
    UPDATE detalles_requerimiento SET estado = 'Cancelado' WHERE requerimiento_id = p_req_id;

    RETURN json_build_object('success', true, 'message', 'Requerimiento anulado con éxito.');
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object('success', false, 'message', 'Error interno al anular: ' || SQLERRM);
END;
$function$;
