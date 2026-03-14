-- Migration: Create Material Request (Pedido de Salida) Tables and RPCs

-- 1. Create Tables
CREATE TABLE IF NOT EXISTS public.pedidos_salida (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    obra_id UUID REFERENCES public.obras(id) ON DELETE CASCADE,
    solicitante_id UUID REFERENCES public.profiles(id),
    encargado_id UUID REFERENCES public.profiles(id),
    numero_vale TEXT NOT NULL,
    estado TEXT DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Aprobado', 'Rechazado', 'Parcial')),
    destino_o_uso TEXT,
    bloque_id UUID REFERENCES public.bloques(id),
    tercero_id UUID REFERENCES public.terceros(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pedidos_salida_detalle (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id UUID REFERENCES public.pedidos_salida(id) ON DELETE CASCADE,
    material_id UUID REFERENCES public.materiales(id),
    equipo_id UUID REFERENCES public.equipos(id),
    epp_id UUID REFERENCES public.epps_c(id),
    cantidad_solicitada NUMERIC NOT NULL,
    cantidad_entregada NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT one_item_type CHECK (
        (material_id IS NOT NULL AND equipo_id IS NULL AND epp_id IS NULL) OR
        (material_id IS NULL AND equipo_id IS NOT NULL AND epp_id IS NULL) OR
        (material_id IS NULL AND equipo_id IS NULL AND epp_id IS NOT NULL)
    )
);

-- Index for unique voucher per obra (though we'll use a sequence-like counter)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedido_vale_obra ON public.pedidos_salida(obra_id, numero_vale);

-- 2. RPC to create a pedido
CREATE OR REPLACE FUNCTION public.crear_pedido_salida(
    p_obra_id UUID,
    p_solicitante_id UUID,
    p_encargado_id UUID,
    p_destino TEXT,
    p_bloque_id UUID,
    p_tercero_id UUID,
    p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pedido_id UUID;
    v_vale_num TEXT;
    v_count INT;
    v_item JSONB;
BEGIN
    -- Atomic generation of voucher number (P-YYYY-XXXX)
    INSERT INTO public.counters (key, value)
    VALUES ('pedido_salida_' || p_obra_id, 1)
    ON CONFLICT (key) DO UPDATE SET value = public.counters.value + 1
    RETURNING value INTO v_count;

    v_vale_num := 'P-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(v_count::TEXT, 4, '0');

    -- Insert Header
    INSERT INTO public.pedidos_salida (
        obra_id, solicitante_id, encargado_id, numero_vale, destino_o_uso, bloque_id, tercero_id
    ) VALUES (
        p_obra_id, p_solicitante_id, p_encargado_id, v_vale_num, p_destino, p_bloque_id, p_tercero_id
    ) RETURNING id INTO v_pedido_id;

    -- Insert Details
    FOR v_item IN SELECT * FROM JSONB_ARRAY_ELEMENTS(p_items)
    LOOP
        INSERT INTO public.pedidos_salida_detalle (
            pedido_id, material_id, equipo_id, epp_id, cantidad_solicitada
        ) VALUES (
            v_pedido_id,
            (v_item->>'material_id')::UUID,
            (v_item->>'equipo_id')::UUID,
            (v_item->>'epp_id')::UUID,
            (v_item->>'cantidad')::NUMERIC
        );
    END LOOP;

    RETURN JSONB_BUILD_OBJECT('id', v_pedido_id, 'numero_vale', v_vale_num);
END;
$$;

-- 3. RPC to approve a pedido
CREATE OR REPLACE FUNCTION public.aprobar_pedido_salida(
    p_pedido_id UUID,
    p_items_entrega JSONB -- [{detalle_id, cantidad_entregada}]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pedido RECORD;
    v_item_entrega JSONB;
    v_detalle RECORD;
    v_stock_actual NUMERIC;
    v_all_full_delivered BOOLEAN := TRUE;
    v_caller_role TEXT;
    v_solicitante_nombre TEXT;
BEGIN
    -- Security Check: Validate user role
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
    IF v_caller_role NOT IN ('admin', 'almacenero') THEN
        RAISE EXCEPTION 'No tiene permisos para aprobar pedidos.';
    END IF;

    -- Get Pedido Header
    SELECT * INTO v_pedido FROM public.pedidos_salida WHERE id = p_pedido_id;
    IF v_pedido.id IS NULL THEN RAISE EXCEPTION 'Pedido no encontrado.'; END IF;
    IF v_pedido.estado NOT IN ('Pendiente', 'Parcial') THEN RAISE EXCEPTION 'El pedido no está pendiente de atención.'; END IF;

    -- Get Solicitante Name for movements
    SELECT nombre INTO v_solicitante_nombre FROM public.profiles WHERE id = v_pedido.solicitante_id;

    -- Process Deliveries
    FOR v_item_entrega IN SELECT * FROM JSONB_ARRAY_ELEMENTS(p_items_entrega)
    LOOP
        -- Get Detail Record
        SELECT * INTO v_detalle FROM public.pedidos_salida_detalle WHERE id = (v_item_entrega->>'detalle_id')::UUID;
        
        -- Skip if quantity is 0
        IF (v_item_entrega->>'cantidad_entregada')::NUMERIC <= 0 THEN
            v_all_full_delivered := FALSE;
            CONTINUE;
        END IF;

        -- Validate Stock (Reusing logic from registrar_salida_almacen)
        SELECT cantidad_actual INTO v_stock_actual
        FROM inventario_obra
        WHERE obra_id = v_pedido.obra_id
          AND (
            (v_detalle.material_id IS NOT NULL AND material_id = v_detalle.material_id) OR
            (v_detalle.equipo_id IS NOT NULL AND equipo_id = v_detalle.equipo_id) OR
            (v_detalle.epp_id IS NOT NULL AND epp_id = v_detalle.epp_id)
          );

        IF v_stock_actual IS NULL OR v_stock_actual < (v_item_entrega->>'cantidad_entregada')::NUMERIC THEN
             RAISE EXCEPTION 'Stock insuficiente para el ítem %.', COALESCE(v_detalle.material_id::TEXT, v_detalle.equipo_id::TEXT, v_detalle.epp_id::TEXT);
        END IF;

        -- Update Inventory
        UPDATE inventario_obra
        SET cantidad_actual = cantidad_actual - (v_item_entrega->>'cantidad_entregada')::NUMERIC,
            updated_at = NOW()
        WHERE obra_id = v_pedido.obra_id
          AND (
            (v_detalle.material_id IS NOT NULL AND material_id = v_detalle.material_id) OR
            (v_detalle.equipo_id IS NOT NULL AND equipo_id = v_detalle.equipo_id) OR
            (v_detalle.epp_id IS NOT NULL AND epp_id = v_detalle.epp_id)
          );

        -- Registrar el Movimiento (Salida)
        INSERT INTO movimientos_almacen (
            obra_id, tipo, material_id, equipo_id, epp_id, cantidad,
            fecha, destino_o_uso, solicitante,
            tercero_id, encargado_id, bloque_id, numero_vale, created_at
        ) VALUES (
            v_pedido.obra_id, 'SALIDA', v_detalle.material_id, v_detalle.equipo_id, v_detalle.epp_id, 
            (v_item_entrega->>'cantidad_entregada')::NUMERIC,
            NOW(), v_pedido.destino_o_uso, v_solicitante_nombre,
            v_pedido.tercero_id, v_pedido.encargado_id, v_pedido.bloque_id, v_pedido.numero_vale, NOW()
        );

        -- Update Pedido Detail
        UPDATE public.pedidos_salida_detalle
        SET cantidad_entregada = cantidad_entregada + (v_item_entrega->>'cantidad_entregada')::NUMERIC
        WHERE id = v_detalle.id;

        -- Check if partial
        IF (v_item_entrega->>'cantidad_entregada')::NUMERIC < v_detalle.cantidad_solicitada THEN
            v_all_full_delivered := FALSE;
        END IF;
    END LOOP;

    -- Update Pedido Status
    UPDATE public.pedidos_salida
    SET estado = CASE WHEN v_all_full_delivered THEN 'Aprobado' ELSE 'Parcial' END,
        updated_at = NOW()
    WHERE id = p_pedido_id;

END;
$$;

-- RPC to Void/Cancel a Request
CREATE OR REPLACE FUNCTION public.anular_pedido_salida(p_pedido_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only allow cancelling if status is 'Pendiente'
    IF NOT EXISTS (
        SELECT 1 FROM public.pedidos_salida 
        WHERE id = p_pedido_id AND estado = 'Pendiente'
    ) THEN
        RAISE EXCEPTION 'Solo se pueden anular pedidos en estado Pendiente';
    END IF;

    UPDATE public.pedidos_salida
    SET estado = 'Rechazado', -- We'll use Rechazado or 'Anulado' if we add it, but Rechazado works for now as "Cancelled".
        updated_at = NOW()
    WHERE id = p_pedido_id;
END;
$$;

-- RPC to Update a Request (Header and Details)
CREATE OR REPLACE FUNCTION public.actualizar_pedido_salida(
    p_pedido_id UUID,
    p_destino TEXT,
    p_bloque_id UUID,
    p_tercero_id UUID,
    p_encargado_id UUID,
    p_items JSONB -- [{ material_id, equipo_id, epp_id, cantidad }]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item JSONB;
BEGIN
    -- Only allow editing if status is 'Pendiente'
    IF NOT EXISTS (
        SELECT 1 FROM public.pedidos_salida 
        WHERE id = p_pedido_id AND estado = 'Pendiente'
    ) THEN
        RAISE EXCEPTION 'Solo se pueden editar pedidos en estado Pendiente';
    END IF;

    -- Update Header
    UPDATE public.pedidos_salida
    SET destino_o_uso = p_destino,
        bloque_id = p_bloque_id,
        tercero_id = p_tercero_id,
        encargado_id = p_encargado_id,
        updated_at = NOW()
    WHERE id = p_pedido_id;

    -- Update Details (Delete and Re-insert is simplest for atomic updates)
    DELETE FROM public.pedidos_salida_detalle WHERE pedido_id = p_pedido_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO public.pedidos_salida_detalle (
            pedido_id,
            material_id,
            equipo_id,
            epp_id,
            cantidad_solicitada
        ) VALUES (
            p_pedido_id,
            (v_item->>'material_id')::UUID,
            (v_item->>'equipo_id')::UUID,
            (v_item->>'epp_id')::UUID,
            (v_item->>'cantidad')::NUMERIC
        );
    END LOOP;
END;
$$;
