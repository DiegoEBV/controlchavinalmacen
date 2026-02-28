CREATE OR REPLACE FUNCTION registrar_entrada_caja_chica(
  p_requerimiento_id UUID,
  p_detalle_req_id UUID,
  p_material_id UUID,
  p_equipo_id UUID,
  p_epp_id UUID,
  p_cantidad NUMERIC,
  p_factura TEXT,
  p_usuario TEXT,
  p_obra_id UUID,
  p_frente_id UUID DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vintar_code text; 
  v_year int; 
  v_count int;
  v_req_solicitante text;
  v_req_correlativo int;
  v_solicitante_user_id uuid;
  v_item_desc text;
BEGIN
  v_year := extract(year from current_date);
  
  INSERT INTO counters (key, value) VALUES ('vintar_' || v_year, 1)
  ON CONFLICT (key) DO UPDATE SET value = counters.value + 1
  RETURNING value INTO v_count;
  v_vintar_code := 'VIN-' || v_year || '-' || lpad(v_count::text, 4, '0');

  -- Insertar el movimiento
  INSERT INTO public.movimientos_almacen (
    tipo, material_id, equipo_id, epp_id, cantidad, documento_referencia, requerimiento_id,
    detalle_requerimiento_id, destino_o_uso, solicitante, obra_id, vintar_code
  ) VALUES (
    'ENTRADA', p_material_id, p_equipo_id, p_epp_id, p_cantidad, p_factura, p_requerimiento_id,
    p_detalle_req_id, 'COMPRA CAJA CHICA', p_usuario, p_obra_id, v_vintar_code
  );

  -- Actualizar el detalle de requerimiento
  UPDATE public.detalles_requerimiento
  SET 
    cantidad_caja_chica = COALESCE(cantidad_caja_chica, 0) + p_cantidad,
    cantidad_atendida = COALESCE(cantidad_atendida, 0) + p_cantidad,
    estado = CASE WHEN (COALESCE(cantidad_atendida, 0) + p_cantidad) >= cantidad_solicitada THEN 'Atendido' ELSE 'Parcial' END
  WHERE id = p_detalle_req_id;

  -- AGREGADO: ACTUALIZAR INVENTARIO MANUALMENTE
  IF p_material_id IS NOT NULL THEN
      INSERT INTO inventario_obra (obra_id, material_id, cantidad_actual, ultimo_ingreso, updated_at)
      VALUES (p_obra_id, p_material_id, p_cantidad, now(), now())
      ON CONFLICT (obra_id, material_id) WHERE material_id IS NOT NULL
      DO UPDATE SET 
          cantidad_actual = inventario_obra.cantidad_actual + p_cantidad,
          ultimo_ingreso = now(),
          updated_at = now();
  ELSIF p_equipo_id IS NOT NULL THEN
      INSERT INTO inventario_obra (obra_id, equipo_id, cantidad_actual, ultimo_ingreso, updated_at)
      VALUES (p_obra_id, p_equipo_id, p_cantidad, now(), now())
      ON CONFLICT (obra_id, equipo_id) WHERE equipo_id IS NOT NULL
      DO UPDATE SET 
          cantidad_actual = inventario_obra.cantidad_actual + p_cantidad,
          ultimo_ingreso = now(),
          updated_at = now();
  ELSIF p_epp_id IS NOT NULL THEN
      INSERT INTO inventario_obra (obra_id, epp_id, cantidad_actual, ultimo_ingreso, updated_at)
      VALUES (p_obra_id, p_epp_id, p_cantidad, now(), now())
      ON CONFLICT (obra_id, epp_id) WHERE epp_id IS NOT NULL
      DO UPDATE SET 
          cantidad_actual = inventario_obra.cantidad_actual + p_cantidad,
          ultimo_ingreso = now(),
          updated_at = now();
  END IF;

  -- Notificación al solicitante del requerimiento
  IF p_requerimiento_id IS NOT NULL THEN
    SELECT r.solicitante, r.item_correlativo
    INTO v_req_solicitante, v_req_correlativo
    FROM requerimientos r WHERE r.id = p_requerimiento_id;

    -- Obtener descripción del ítem
    IF p_material_id IS NOT NULL THEN
      SELECT descripcion INTO v_item_desc FROM materiales WHERE id = p_material_id;
    ELSIF p_equipo_id IS NOT NULL THEN
      SELECT nombre INTO v_item_desc FROM equipos WHERE id = p_equipo_id;
    ELSIF p_epp_id IS NOT NULL THEN
      SELECT descripcion INTO v_item_desc FROM epps_c WHERE id = p_epp_id;
    END IF;

    -- Buscar user_id del solicitante
    SELECT id INTO v_solicitante_user_id
    FROM profiles WHERE nombre = v_req_solicitante LIMIT 1;

    IF v_solicitante_user_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, message, type, read, created_at)
      VALUES (
        v_solicitante_user_id,
        'Atención Req. #' || v_req_correlativo || ' (Caja Chica)',
        COALESCE(v_item_desc, 'Ítem') || ' — ' || p_cantidad || ' und. ingresadas al almacén.',
        'ENTRADA',
        false,
        now()
      );
    END IF;
  END IF;

  RETURN v_vintar_code;
END;
$$;
