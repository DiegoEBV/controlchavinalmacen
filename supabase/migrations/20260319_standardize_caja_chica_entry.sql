-- Migration: Actualizar registrar_entrada_caja_chica con CPP y estándares de seguridad
-- Unifica la lógica de registro de caja chica con las mejoras recientes en el módulo de almacén.

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
  p_precio_unitario NUMERIC DEFAULT NULL,
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
  v_cpp_antes numeric;
  v_stock_antes numeric;
  v_cpp_nuevo numeric;
  v_pu_usado numeric;
BEGIN
  -- Generación de VINTAR Único
  v_year := extract(year from current_date);

  INSERT INTO counters (key, value) VALUES ('vintar_' || v_year, 1)
  ON CONFLICT (key) DO UPDATE SET value = counters.value + 1
  RETURNING value INTO v_count;
  v_vintar_code := 'VIN-' || v_year || '-' || lpad(v_count::text, 4, '0');

  -- 1. Obtener stock y CPP actual
  v_cpp_antes := 0;
  v_stock_antes := 0;
  IF p_material_id IS NOT NULL THEN
      SELECT cantidad_actual, COALESCE(costo_promedio, 0) INTO v_stock_antes, v_cpp_antes
      FROM inventario_obra WHERE obra_id = p_obra_id AND material_id = p_material_id;
  ELSIF p_equipo_id IS NOT NULL THEN
      SELECT cantidad_actual, COALESCE(costo_promedio, 0) INTO v_stock_antes, v_cpp_antes
      FROM inventario_obra WHERE obra_id = p_obra_id AND equipo_id = p_equipo_id;
  ELSIF p_epp_id IS NOT NULL THEN
      SELECT cantidad_actual, COALESCE(costo_promedio, 0) INTO v_stock_antes, v_cpp_antes
      FROM inventario_obra WHERE obra_id = p_obra_id AND epp_id = p_epp_id;
  END IF;
  v_stock_antes := COALESCE(v_stock_antes, 0);
  v_cpp_antes := COALESCE(v_cpp_antes, 0);

  -- 2. Calcular nuevo CPP
  -- Usamos el precio unitario proporcionado o el actual si no se provee
  IF p_precio_unitario IS NOT NULL AND p_precio_unitario > 0 THEN
      v_pu_usado := p_precio_unitario;
      IF (v_stock_antes + p_cantidad) > 0 THEN
          v_cpp_nuevo := ((v_stock_antes * v_cpp_antes) + (p_cantidad * v_pu_usado)) / (v_stock_antes + p_cantidad);
      ELSE
          v_cpp_nuevo := v_pu_usado;
      END IF;
  ELSE
      v_pu_usado := v_cpp_antes;
      v_cpp_nuevo := v_cpp_antes;
  END IF;

  -- A. Insertar movimiento estandarizado
  INSERT INTO public.movimientos_almacen (
    obra_id, tipo, material_id, equipo_id, epp_id, cantidad, 
    fecha, documento_referencia, requerimiento_id, detalle_requerimiento_id,
    destino_o_uso, solicitante, vintar_code, costo_unitario, created_at
  ) VALUES (
    p_obra_id, 'ENTRADA', p_material_id, p_equipo_id, p_epp_id, p_cantidad,
    now(), p_factura, p_requerimiento_id, p_detalle_req_id,
    'COMPRA CAJA CHICA', p_usuario, v_vintar_code, v_pu_usado, now()
  );

  -- B. Actualizar detalle requerimiento con fecha_atencion
  UPDATE public.detalles_requerimiento
  SET
    cantidad_caja_chica = COALESCE(cantidad_caja_chica, 0) + p_cantidad,
    cantidad_atendida = COALESCE(cantidad_atendida, 0) + p_cantidad,
    fecha_atencion = now(),
    estado = CASE 
        WHEN (COALESCE(cantidad_atendida, 0) + p_cantidad) >= cantidad_solicitada THEN 'Atendido' 
        ELSE 'Parcial' 
    END
  WHERE id = p_detalle_req_id;

  -- C. Actualizar INVENTARIO con nuevo CPP
  IF p_material_id IS NOT NULL THEN
      INSERT INTO inventario_obra (obra_id, material_id, cantidad_actual, costo_promedio, ultimo_ingreso, updated_at)
      VALUES (p_obra_id, p_material_id, p_cantidad, v_cpp_nuevo, now(), now())
      ON CONFLICT (obra_id, material_id) WHERE material_id IS NOT NULL
      DO UPDATE SET
          costo_promedio = v_cpp_nuevo,
          cantidad_actual = inventario_obra.cantidad_actual + p_cantidad,
          ultimo_ingreso = now(), 
          updated_at = now();
  ELSIF p_equipo_id IS NOT NULL THEN
      INSERT INTO inventario_obra (obra_id, equipo_id, cantidad_actual, costo_promedio, ultimo_ingreso, updated_at)
      VALUES (p_obra_id, p_equipo_id, p_cantidad, v_cpp_nuevo, now(), now())
      ON CONFLICT (obra_id, equipo_id) WHERE equipo_id IS NOT NULL
      DO UPDATE SET
          costo_promedio = v_cpp_nuevo,
          cantidad_actual = inventario_obra.cantidad_actual + p_cantidad,
          ultimo_ingreso = now(), 
          updated_at = now();
  ELSIF p_epp_id IS NOT NULL THEN
      INSERT INTO inventario_obra (obra_id, epp_id, cantidad_actual, costo_promedio, ultimo_ingreso, updated_at)
      VALUES (p_obra_id, p_epp_id, p_cantidad, v_cpp_nuevo, now(), now())
      ON CONFLICT (obra_id, epp_id) WHERE epp_id IS NOT NULL
      DO UPDATE SET
          costo_promedio = v_cpp_nuevo,
          cantidad_actual = inventario_obra.cantidad_actual + p_cantidad,
          ultimo_ingreso = now(), 
          updated_at = now();
  END IF;

  -- D. Auditoría en historial_costos
  INSERT INTO historial_costos (obra_id, material_id, equipo_id, epp_id, costo_promedio_antes, costo_promedio_despues, movimiento_tipo, cantidad, precio_unitario_usado)
  VALUES (p_obra_id, p_material_id, p_equipo_id, p_epp_id, v_cpp_antes, v_cpp_nuevo, 'ENTRADA', p_cantidad, v_pu_usado);

  -- E. Notificación estandarizada
  IF p_requerimiento_id IS NOT NULL THEN
    SELECT r.solicitante, r.item_correlativo INTO v_req_solicitante, v_req_correlativo
    FROM public.requerimientos r WHERE r.id = p_requerimiento_id;

    IF p_material_id IS NOT NULL THEN
      SELECT descripcion INTO v_item_desc FROM public.materiales WHERE id = p_material_id;
    ELSIF p_equipo_id IS NOT NULL THEN
      SELECT nombre INTO v_item_desc FROM public.equipos WHERE id = p_equipo_id;
    ELSIF p_epp_id IS NOT NULL THEN
      SELECT descripcion INTO v_item_desc FROM public.epps_c WHERE id = p_epp_id;
    END IF;

    SELECT id INTO v_solicitante_user_id FROM public.profiles
    WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(v_req_solicitante)) LIMIT 1;

    IF v_solicitante_user_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, title, message, type, read, created_at)
      VALUES (
        v_solicitante_user_id,
        'Material Atendido (Caja Chica)',
        COALESCE(v_item_desc, 'Ítem') || ' — ' || p_cantidad || ' und. ingresadas para Req. #' || COALESCE(v_req_correlativo::text, '?'),
        'ENTRADA',
        false,
        now()
      );
    END IF;
  END IF;

  RETURN v_vintar_code;
END;
$$;
