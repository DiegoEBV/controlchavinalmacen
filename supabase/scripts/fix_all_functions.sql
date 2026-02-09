-- CLEANUP SCRIPT: Run this to fix "function name is not unique" errors

-- 1. Drop ALL existing versions of the functions to start fresh
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop all versions of registrar_entrada_almacen
    FOR r IN (SELECT oid::regprocedure FROM pg_proc WHERE proname = 'registrar_entrada_almacen') LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.oid || ' CASCADE';
    END LOOP;
    
    -- Drop all versions of registrar_salida_almacen
    FOR r IN (SELECT oid::regprocedure FROM pg_proc WHERE proname = 'registrar_salida_almacen') LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.oid || ' CASCADE';
    END LOOP;
END $$;

-- 2. Re-create registrar_entrada_almacen with correct signature
CREATE OR REPLACE FUNCTION registrar_entrada_almacen(
  p_material_id UUID,
  p_cantidad NUMERIC,
  p_req_id UUID,
  p_det_req_id UUID,
  p_doc_ref TEXT,
  p_obra_id UUID
)
RETURNS VOID AS $$
BEGIN
  -- Insert Movement
  INSERT INTO movimientos_almacen (
    material_id, cantidad, tipo, fecha, requerimiento_id, documento_referencia, obra_id, created_at
  ) VALUES (
    p_material_id, p_cantidad, 'ENTRADA', NOW(), p_req_id, p_doc_ref, p_obra_id, NOW()
  );

  -- Update Inventory
  IF EXISTS (SELECT 1 FROM inventario_obra WHERE material_id = p_material_id AND obra_id = p_obra_id) THEN
    UPDATE inventario_obra
    SET cantidad_actual = cantidad_actual + p_cantidad, ultimo_ingreso = NOW(), updated_at = NOW()
    WHERE material_id = p_material_id AND obra_id = p_obra_id;
  ELSE
    INSERT INTO inventario_obra (obra_id, material_id, cantidad_actual, ultimo_ingreso, updated_at)
    VALUES (p_obra_id, p_material_id, p_cantidad, NOW(), NOW());
  END IF;

  -- Update Requirement Detail
  UPDATE detalles_requerimiento
  SET cantidad_atendida = COALESCE(cantidad_atendida, 0) + p_cantidad,
      estado = CASE 
          WHEN (COALESCE(cantidad_atendida, 0) + p_cantidad) >= cantidad_solicitada THEN 'Atendido' 
          ELSE 'Parcial' 
      END
  WHERE id = p_det_req_id;
END;
$$ LANGUAGE plpgsql;

-- 3. Re-create registrar_salida_almacen with correct signature
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
  -- Check Stock
  SELECT cantidad_actual INTO v_current_stock
  FROM inventario_obra
  WHERE material_id = p_material_id AND obra_id = p_obra_id;

  IF v_current_stock IS NULL OR v_current_stock < p_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente';
  END IF;

  -- Insert Movement
  INSERT INTO movimientos_almacen (
    material_id, cantidad, tipo, fecha, destino_o_uso, solicitante, obra_id, created_at
  ) VALUES (
    p_material_id, p_cantidad, 'SALIDA', NOW(), p_destino, p_solicitante, p_obra_id, NOW()
  );

  -- Update Inventory
  UPDATE inventario_obra
  SET cantidad_actual = cantidad_actual - p_cantidad, updated_at = NOW()
  WHERE material_id = p_material_id AND obra_id = p_obra_id;
END;
$$ LANGUAGE plpgsql;
