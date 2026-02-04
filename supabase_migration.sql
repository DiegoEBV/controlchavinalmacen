-- Create Obras Table (Project/Parent) - Necessary for integrity
CREATE TABLE IF NOT EXISTS obras (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre_obra TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Requerimientos Header
CREATE TABLE IF NOT EXISTS requerimientos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    obra_id UUID REFERENCES obras(id) ON DELETE CASCADE,
    item_correlativo SERIAL,
    bloque TEXT,
    especialidad TEXT,
    solicitante TEXT,
    fecha_solicitud DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Requerimientos Details (Items)
CREATE TABLE IF NOT EXISTS detalles_requerimiento (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    requerimiento_id UUID REFERENCES requerimientos(id) ON DELETE CASCADE,
    
    -- Insumo
    tipo TEXT, -- Material/Servicio
    material_categoria TEXT,
    descripcion TEXT,
    unidad TEXT,
    cantidad_solicitada NUMERIC,
    
    -- Logistica / Tiempos
    cantidad_atendida NUMERIC DEFAULT 0,
    atencion_por TEXT,
    fecha_atencion DATE,
    numero_solicitud_compra TEXT,
    orden_compra TEXT,
    proveedor TEXT,
    estado TEXT DEFAULT 'Pendiente', -- Pendiente, Parcial, Atendido, Cancelado
    observaciones TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Materiales Master Table
CREATE TABLE IF NOT EXISTS materiales (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    categoria TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    unidad TEXT NOT NULL,
    stock_maximo NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_det_req ON detalles_requerimiento(requerimiento_id);

-- RLS Policies (Security) - Opening access for this application
ALTER TABLE obras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public setup" ON obras FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE requerimientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public setup" ON requerimientos FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE detalles_requerimiento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public setup" ON detalles_requerimiento FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE materiales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public setup" ON materiales FOR ALL USING (true) WITH CHECK (true);

-- ==========================================
-- WAREHOUSE / ALMACEN MODULE
-- ==========================================

-- 1. Inventory Table (Current Stock)
CREATE TABLE IF NOT EXISTS inventario_obra (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    material_id UUID REFERENCES materiales(id) NOT NULL UNIQUE,
    cantidad_actual NUMERIC DEFAULT 0 CHECK (cantidad_actual >= 0),
    ultimo_ingreso DATE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Movements History
CREATE TABLE IF NOT EXISTS movimientos_almacen (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tipo TEXT NOT NULL CHECK (tipo IN ('ENTRADA', 'SALIDA')),
    material_id UUID REFERENCES materiales(id) NOT NULL,
    cantidad NUMERIC NOT NULL CHECK (cantidad > 0),
    fecha DATE DEFAULT CURRENT_DATE,
    
    -- For Entries (Linked to REQ)
    documento_referencia TEXT, -- Guia remision / Factura
    requerimiento_id UUID REFERENCES requerimientos(id),
    detalle_requerimiento_id UUID REFERENCES detalles_requerimiento(id),
    
    -- For Exits
    destino_o_uso TEXT, -- A donde va el material
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for Warehouse
ALTER TABLE inventario_obra ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public setup" ON inventario_obra FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE movimientos_almacen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public setup" ON movimientos_almacen FOR ALL USING (true) WITH CHECK (true);


-- ==========================================
-- TRANSACTIONAL FUNCTIONS (RPC)
-- ==========================================

-- Function to Register Entry: 
-- 1. Add Movement 
-- 2. Update Stock 
-- 3. Update Req Detail (Attended Qty)
CREATE OR REPLACE FUNCTION registrar_entrada_almacen(
    p_material_id UUID,
    p_cantidad NUMERIC,
    p_req_id UUID,
    p_det_req_id UUID,
    p_doc_ref TEXT
)
RETURNS VOID AS $$
BEGIN
    -- 1. Insert Movement
    INSERT INTO movimientos_almacen (tipo, material_id, cantidad, requerimiento_id, detalle_requerimiento_id, documento_referencia)
    VALUES ('ENTRADA', p_material_id, p_cantidad, p_req_id, p_det_req_id, p_doc_ref);

    -- 2. Upsert Inventory (Add Stock)
    INSERT INTO inventario_obra (material_id, cantidad_actual, ultimo_ingreso)
    VALUES (p_material_id, p_cantidad, CURRENT_DATE)
    ON CONFLICT (material_id) 
    DO UPDATE SET 
        cantidad_actual = inventario_obra.cantidad_actual + EXCLUDED.cantidad_actual,
        ultimo_ingreso = EXCLUDED.ultimo_ingreso;

    -- 3. Update Requirement Detail
    UPDATE detalles_requerimiento
    SET cantidad_atendida = cantidad_atendida + p_cantidad,
        estado = CASE 
            WHEN (cantidad_atendida + p_cantidad) >= cantidad_solicitada THEN 'Atendido'
            ELSE 'Parcial'
        END
    WHERE id = p_det_req_id;
END;
$$ LANGUAGE plpgsql;

-- Function to Register Exit:
-- 1. Add Movement
-- 2. Update Stock (Subtract)
CREATE OR REPLACE FUNCTION registrar_salida_almacen(
    p_material_id UUID,
    p_cantidad NUMERIC,
    p_destino TEXT
)
RETURNS VOID AS $$
DECLARE
    v_stock NUMERIC;
BEGIN
    -- Check stock
    SELECT cantidad_actual INTO v_stock FROM inventario_obra WHERE material_id = p_material_id;
    
    IF v_stock IS NULL OR v_stock < p_cantidad THEN
        RAISE EXCEPTION 'Stock insuficiente';
    END IF;

    -- 1. Insert Movement
    INSERT INTO movimientos_almacen (tipo, material_id, cantidad, destino_o_uso)
    VALUES ('SALIDA', p_material_id, p_cantidad, p_destino);

    -- 2. Update Inventory
    UPDATE inventario_obra
    SET cantidad_actual = cantidad_actual - p_cantidad
    WHERE material_id = p_material_id;
END;
$$ LANGUAGE plpgsql;


