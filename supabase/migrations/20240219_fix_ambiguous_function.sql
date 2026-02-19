-- Forcefully drop ALL functions named strict 'registrar_salida_almacen' to remove ambiguity.
-- This block iterates through all overloads and drops them.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS func_signature
             FROM pg_proc
             WHERE proname = 'registrar_salida_almacen'
             AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE';
    END LOOP;
END $$;

-- Now recreate the SINGLE correct function signature
CREATE OR REPLACE FUNCTION registrar_salida_almacen(
  p_material_id UUID DEFAULT NULL,
  p_cantidad NUMERIC DEFAULT 0,
  p_destino TEXT DEFAULT NULL,
  p_solicitante TEXT DEFAULT NULL,
  p_obra_id UUID DEFAULT NULL,
  p_equipo_id UUID DEFAULT NULL,
  p_epp_id UUID DEFAULT NULL,
  p_tercero_id UUID DEFAULT NULL,
  p_encargado_id UUID DEFAULT NULL,
  p_bloque_id UUID DEFAULT NULL,
  p_numero_vale TEXT DEFAULT NULL
)
RETURNS VOID 
LANGUAGE plpgsql
AS $$
DECLARE
  v_stock_actual NUMERIC;
BEGIN
    -- Validar que solo un ID de ítem sea provisto
    IF (CASE WHEN p_material_id IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN p_equipo_id IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN p_epp_id IS NOT NULL THEN 1 ELSE 0 END) <> 1 THEN
        RAISE EXCEPTION 'Debe especificar exactamente un ID de ítem (Material, Equipo o EPP).';
    END IF;

    -- Verificar stock en inventario_obra (Unificado)
    SELECT cantidad_actual INTO v_stock_actual
    FROM inventario_obra
    WHERE obra_id = p_obra_id
      AND (
        (p_material_id IS NOT NULL AND material_id = p_material_id) OR
        (p_equipo_id IS NOT NULL AND equipo_id = p_equipo_id) OR
        (p_epp_id IS NOT NULL AND epp_id = p_epp_id)
      );

    IF v_stock_actual IS NULL OR v_stock_actual < p_cantidad THEN
         RAISE EXCEPTION 'Stock insuficiente en almacén.';
    END IF;

    -- Actualizar inventario_obra (Unificado)
    UPDATE inventario_obra
    SET cantidad_actual = cantidad_actual - p_cantidad,
        updated_at = NOW()
    WHERE obra_id = p_obra_id
      AND (
        (p_material_id IS NOT NULL AND material_id = p_material_id) OR
        (p_equipo_id IS NOT NULL AND equipo_id = p_equipo_id) OR
        (p_epp_id IS NOT NULL AND epp_id = p_epp_id)
      );

    -- Registrar el Movimiento (Salida)
    INSERT INTO movimientos_almacen (
        obra_id,
        tipo,
        material_id,
        equipo_id,
        epp_id,
        cantidad,
        fecha,
        destino_o_uso,
        solicitante,
        tercero_id,
        encargado_id,
        bloque_id,
        numero_vale,
        created_at
    ) VALUES (
        p_obra_id,
        'SALIDA',
        p_material_id,
        p_equipo_id,
        p_epp_id,
        p_cantidad,
        NOW(),
        p_destino,
        p_solicitante,
        p_tercero_id,
        p_encargado_id,
        p_bloque_id,
        p_numero_vale,
        NOW()
    );

END;
$$;
