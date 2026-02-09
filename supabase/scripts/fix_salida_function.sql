-- Function to register warehouse exit
-- Drops the function first to ensure signature updates
DROP FUNCTION IF EXISTS registrar_salida_almacen;

CREATE OR REPLACE FUNCTION registrar_salida_almacen(
  p_material_id UUID,
  p_cantidad NUMERIC,
  p_destino TEXT,
  p_solicitante TEXT,
  p_obra_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_current_stock NUMERIC;
BEGIN
  -- 1. Check Index/Stock
  SELECT cantidad_actual INTO v_current_stock
  FROM inventario_obra
  WHERE material_id = p_material_id AND obra_id = p_obra_id;

  IF v_current_stock IS NULL OR v_current_stock < p_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente';
  END IF;

  -- 2. Insert into movimientos_almacen
  INSERT INTO movimientos_almacen (
    material_id,
    cantidad,
    tipo,
    fecha,
    destino_o_uso,
    solicitante,
    obra_id,
    created_at
  ) VALUES (
    p_material_id,
    p_cantidad,
    'SALIDA',
    NOW(),
    p_destino,
    p_solicitante,
    p_obra_id,
    NOW()
  );

  -- 3. Update inventario_obra
  UPDATE inventario_obra
  SET cantidad_actual = cantidad_actual - p_cantidad,
      updated_at = NOW()
  WHERE material_id = p_material_id AND obra_id = p_obra_id;

END;
$$ LANGUAGE plpgsql;
