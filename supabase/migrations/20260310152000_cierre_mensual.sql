-- ========================================================================
-- MIGRATION: Cierre Mensual Formal
-- Creates snapshot tables and closing function
-- ========================================================================

-- 1. Table for monthly close header
CREATE TABLE IF NOT EXISTS public.cierres_mensuales (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    obra_id uuid NOT NULL REFERENCES public.obras(id),
    anio int NOT NULL,
    mes int NOT NULL,
    fecha_cierre timestamp with time zone DEFAULT now(),
    usuario text NOT NULL,
    estado text DEFAULT 'CERRADO',
    valor_total numeric DEFAULT 0,
    total_items int DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    UNIQUE(obra_id, anio, mes)
);

CREATE INDEX IF NOT EXISTS idx_cierres_mensuales_obra ON public.cierres_mensuales (obra_id, anio, mes);

-- 2. Table for snapshot detail (each item at close time)
CREATE TABLE IF NOT EXISTS public.cierres_mensuales_detalle (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    cierre_id uuid NOT NULL REFERENCES public.cierres_mensuales(id) ON DELETE CASCADE,
    material_id uuid REFERENCES public.materiales(id),
    equipo_id uuid REFERENCES public.equipos(id),
    epp_id uuid REFERENCES public.epps_c(id),
    cantidad numeric DEFAULT 0,
    costo_promedio numeric DEFAULT 0,
    subtotal numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cierres_detalle_cierre ON public.cierres_mensuales_detalle (cierre_id);

-- 3. Function to execute monthly close
CREATE OR REPLACE FUNCTION ejecutar_cierre_mensual(
    p_obra_id UUID,
    p_anio INT,
    p_mes INT,
    p_usuario TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cierre_id UUID;
    v_valor_total NUMERIC := 0;
    v_total_items INT := 0;
    v_item RECORD;
BEGIN
    -- Check if already closed
    IF EXISTS (SELECT 1 FROM cierres_mensuales WHERE obra_id = p_obra_id AND anio = p_anio AND mes = p_mes) THEN
        RAISE EXCEPTION 'El mes %/% ya fue cerrado para esta obra.', p_mes, p_anio;
    END IF;

    -- Create the close header
    INSERT INTO cierres_mensuales (obra_id, anio, mes, usuario, estado)
    VALUES (p_obra_id, p_anio, p_mes, p_usuario, 'CERRADO')
    RETURNING id INTO v_cierre_id;

    -- Snapshot: copy ALL inventory items with their current CPP
    FOR v_item IN
        SELECT material_id, equipo_id, epp_id, cantidad_actual, COALESCE(costo_promedio, 0) as cpp
        FROM inventario_obra
        WHERE obra_id = p_obra_id AND cantidad_actual > 0
    LOOP
        INSERT INTO cierres_mensuales_detalle (cierre_id, material_id, equipo_id, epp_id, cantidad, costo_promedio, subtotal)
        VALUES (v_cierre_id, v_item.material_id, v_item.equipo_id, v_item.epp_id,
                v_item.cantidad_actual, v_item.cpp, v_item.cantidad_actual * v_item.cpp);

        v_valor_total := v_valor_total + (v_item.cantidad_actual * v_item.cpp);
        v_total_items := v_total_items + 1;
    END LOOP;

    -- Update header with totals
    UPDATE cierres_mensuales
    SET valor_total = v_valor_total, total_items = v_total_items
    WHERE id = v_cierre_id;

    RETURN jsonb_build_object(
        'cierre_id', v_cierre_id,
        'valor_total', v_valor_total,
        'total_items', v_total_items,
        'message', 'Cierre mensual ejecutado correctamente.'
    );
END;
$$;
