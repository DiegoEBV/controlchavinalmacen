-- 1. Schema Changes: Adapt key constraints on existing inventario_obra
-- Remove existing constraints that might conflict with nullable material_id or duplicates
ALTER TABLE inventario_obra
DROP CONSTRAINT IF EXISTS inventario_obra_material_id_key,
DROP CONSTRAINT IF EXISTS inventario_obra_obra_id_material_id_key;

-- Add new columns if not exist
ALTER TABLE inventario_obra
ADD COLUMN IF NOT EXISTS equipo_id UUID REFERENCES equipos(id),
ADD COLUMN IF NOT EXISTS epp_id UUID REFERENCES epps_c(id);

-- Make material_id nullable
ALTER TABLE inventario_obra
ALTER COLUMN material_id DROP NOT NULL;

-- Ensure only one type of item relates to an inventory record
ALTER TABLE inventario_obra
DROP CONSTRAINT IF EXISTS check_inventory_item_type;

ALTER TABLE inventario_obra
ADD CONSTRAINT check_inventory_item_type 
CHECK (
  (material_id IS NOT NULL AND equipo_id IS NULL AND epp_id IS NULL) OR
  (material_id IS NULL AND equipo_id IS NOT NULL AND epp_id IS NULL) OR
  (material_id IS NULL AND equipo_id IS NULL AND epp_id IS NOT NULL)
);

-- Add Unique Indexes for each type (Partial Indexes avoid NULL issues)
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_obra_mat ON inventario_obra (obra_id, material_id) WHERE material_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_obra_eq ON inventario_obra (obra_id, equipo_id) WHERE equipo_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_obra_epp ON inventario_obra (obra_id, epp_id) WHERE epp_id IS NOT NULL;


-- Update movimeintos_almacen to support Equipment and EPPs references if not already
ALTER TABLE movimientos_almacen
ADD COLUMN IF NOT EXISTS equipo_id UUID REFERENCES equipos(id),
ADD COLUMN IF NOT EXISTS epp_id UUID REFERENCES epps_c(id);

-- Make material_id nullable in movements if it wasn't
ALTER TABLE movimientos_almacen
ALTER COLUMN material_id DROP NOT NULL;


-- 2. Clean up Catalog Tables (Drop stock columns as requested)
ALTER TABLE equipos DROP COLUMN IF EXISTS cantidad;
ALTER TABLE epps_c DROP COLUMN IF EXISTS stock_actual;


-- 3. Update Stored Procedures

-- A. REGISTRAR ENTRADA MASIVA (Refactored to use ONLY inventario_obra)
CREATE OR REPLACE FUNCTION registrar_entrada_masiva(
    p_items JSONB,
    p_doc_ref TEXT,
    p_obra_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_item RECORD;
    v_vintar_code text;
    v_year int;
    v_count int;
BEGIN
    -- Generar VINTAR único
    v_year := extract(year from current_date);
    
    -- Obtener siguiente secuencial para el año
    INSERT INTO counters (key, value)
    VALUES ('vintar_' || v_year, 1)
    ON CONFLICT (key) DO UPDATE SET value = counters.value + 1
    RETURNING value INTO v_count;

    v_vintar_code := 'VIN-' || v_year || '-' || lpad(v_count::text, 4, '0');

    -- Iterar e insertar
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        material_id uuid,
        equipo_id uuid,
        epp_id uuid,
        cantidad numeric,
        req_id uuid,
        det_req_id uuid
    )
    LOOP
        -- Insertar Movimiento
        INSERT INTO movimientos_almacen (
            obra_id,
            tipo,
            material_id,
            equipo_id,
            epp_id,
            cantidad,
            fecha,
            documento_referencia,
            requerimiento_id,
            created_at,
            vintar_code,
            destino_o_uso
        ) VALUES (
            p_obra_id,
            'ENTRADA',
            v_item.material_id,
            v_item.equipo_id,
            v_item.epp_id,
            v_item.cantidad,
            now(),
            p_doc_ref,
            v_item.req_id,
            now(),
            v_vintar_code,
            'Ingreso a Almacen'
        );

        -- Actualizar detalle requerimiento (si existe)
        IF v_item.det_req_id IS NOT NULL THEN
            UPDATE detalles_requerimiento
            SET cantidad_atendida = COALESCE(cantidad_atendida, 0) + v_item.cantidad,
                fecha_atencion = now(),
                estado = CASE 
                    WHEN (COALESCE(cantidad_atendida, 0) + v_item.cantidad) >= cantidad_solicitada THEN 'Atendido'
                    ELSE 'Parcial'
                END
            WHERE id = v_item.det_req_id;
        END IF;

        -- Actualizar INVENTARIO UNIFICADO (Material, Equipo o EPP)
        
        -- Material
        IF v_item.material_id IS NOT NULL THEN
            INSERT INTO inventario_obra (obra_id, material_id, cantidad_actual, ultimo_ingreso, updated_at)
            VALUES (p_obra_id, v_item.material_id, v_item.cantidad, now(), now())
            ON CONFLICT (obra_id, material_id) WHERE material_id IS NOT NULL
            DO UPDATE SET 
                cantidad_actual = inventario_obra.cantidad_actual + v_item.cantidad,
                ultimo_ingreso = now(),
                updated_at = now();
        
        -- Equipo (Usamos UPSERT manual o ON CONFLICT con el indice parcial)
        ELSIF v_item.equipo_id IS NOT NULL THEN
             INSERT INTO inventario_obra (obra_id, equipo_id, cantidad_actual, ultimo_ingreso, updated_at)
            VALUES (p_obra_id, v_item.equipo_id, v_item.cantidad, now(), now())
            ON CONFLICT (obra_id, equipo_id) WHERE equipo_id IS NOT NULL
            DO UPDATE SET 
                cantidad_actual = inventario_obra.cantidad_actual + v_item.cantidad,
                ultimo_ingreso = now(),
                updated_at = now();

        -- EPP (Usamos UPSERT manual o ON CONFLICT con el indice parcial)
        ELSIF v_item.epp_id IS NOT NULL THEN
             INSERT INTO inventario_obra (obra_id, epp_id, cantidad_actual, ultimo_ingreso, updated_at)
            VALUES (p_obra_id, v_item.epp_id, v_item.cantidad, now(), now())
            ON CONFLICT (obra_id, epp_id) WHERE epp_id IS NOT NULL
            DO UPDATE SET 
                cantidad_actual = inventario_obra.cantidad_actual + v_item.cantidad,
                ultimo_ingreso = now(),
                updated_at = now();
        END IF;

    END LOOP;

    RETURN jsonb_build_object('vintar_code', v_vintar_code);
END;
$$;


-- B. REGISTRAR SALIDA (Refactored to use ONLY inventario_obra)
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
