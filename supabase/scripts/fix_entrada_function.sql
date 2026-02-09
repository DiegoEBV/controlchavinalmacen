-- Function to register warehouse entry
-- Drops the function first to ensure signature updates if types changed
DROP FUNCTION IF EXISTS registrar_entrada_almacen;

CREATE OR REPLACE FUNCTION registrar_entrada_almacen(
  p_material_id UUID,
  p_cantidad NUMERIC,
  p_req_id UUID,
  p_det_req_id UUID,
  p_doc_ref TEXT,
  p_obra_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_current_stock NUMERIC;
BEGIN
  -- 1. Insert into movimientos_almacen
  INSERT INTO movimientos_almacen (
    material_id,
    cantidad,
    tipo,
    fecha,
    requerimiento_id,
    documento_referencia,
    obra_id,
    created_at
  ) VALUES (
    p_material_id,
    p_cantidad,
    'ENTRADA',
    NOW(),
    p_req_id,
    p_doc_ref,
    p_obra_id,
    NOW()
  );

  -- 2. Update or Insert into inventario_obra
  -- Check if record exists
  IF EXISTS (SELECT 1 FROM inventario_obra WHERE material_id = p_material_id AND obra_id = p_obra_id) THEN
    -- Update existing
    UPDATE inventario_obra
    SET cantidad_actual = cantidad_actual + p_cantidad,
        ultimo_ingreso = NOW(),
        updated_at = NOW()
    WHERE material_id = p_material_id AND obra_id = p_obra_id;
  ELSE
    -- Insert new
    INSERT INTO inventario_obra (
      obra_id,
      material_id,
      cantidad_actual,
      ultimo_ingreso,
      updated_at
    ) VALUES (
      p_obra_id,
      p_material_id,
      p_cantidad,
      NOW(),
      NOW()
    );
  END IF;

  -- 3. Update detalle_requerimiento (cantidad_atendida)
  -- Note: p_det_req_id corresponds to detalles_requerimiento.id
  UPDATE detalles_requerimiento
  SET cantidad_atendida = COALESCE(cantidad_atendida, 0) + p_cantidad,
      -- Check if fully attended to update state? Optional logic
      estado = CASE 
          WHEN (COALESCE(cantidad_atendida, 0) + p_cantidad) >= cantidad_solicitada THEN 'Atendido' 
          ELSE 'Parcial' 
      END
  WHERE id = p_det_req_id;

  -- 4. Update Requerimiento status (Optional, if all details are attended)
  -- Left as todo or handled by triggers
END;
$$ LANGUAGE plpgsql;
