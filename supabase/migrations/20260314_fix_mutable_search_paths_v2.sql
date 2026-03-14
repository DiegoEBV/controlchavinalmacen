-- Migration: Fix Search Path Mutable Security Warnings (V2)
-- Affected functions: get_next_vale_salida, admin_update_user_password, actualizar_pedido_salida, aprobar_pedido_salida, get_peek_vale_salida, crear_pedido_salida, registrar_salida_almacen, anular_pedido_salida

-- 1. get_next_vale_salida
CREATE OR REPLACE FUNCTION public.get_next_vale_salida(p_obra_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INT;
    v_year TEXT;
BEGIN
    v_year := TO_CHAR(NOW(), 'YYYY');

    -- Increment counter for salidas in this obra/year
    INSERT INTO public.counters (key, value)
    VALUES ('vale_salida_' || p_obra_id || '_' || v_year, 1)
    ON CONFLICT (key) DO UPDATE SET value = public.counters.value + 1
    RETURNING value INTO v_count;

    -- Return formatted voucher number (V-YYYY-XXXX)
    RETURN 'V-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
END;
$$;

-- 2. admin_update_user_password
CREATE OR REPLACE FUNCTION public.admin_update_user_password(target_user_id UUID, new_password TEXT)
RETURNS VOID 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
    is_admin BOOLEAN;
BEGIN
    -- 1. Verificación de Seguridad
    SELECT (role = 'admin') INTO is_admin FROM public.profiles WHERE id = auth.uid();
    
    IF NOT is_admin OR is_admin IS NULL THEN
        RAISE EXCEPTION 'Acceso denegado: Se requieren permisos de administrador.';
    END IF;

    -- 2. Actualización de Contraseña
    UPDATE auth.users
    SET encrypted_password = crypt(new_password, gen_salt('bf')),
        updated_at = NOW()
    WHERE id = target_user_id;

    -- 3. Invalidar sesiones activas (Forzar Logout)
    BEGIN
        DELETE FROM auth.sessions WHERE user_id = target_user_id;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Error al borrar de auth.sessions: %', SQLERRM;
    END;

    BEGIN
        DELETE FROM auth.refresh_tokens WHERE user_id = target_user_id;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Error al borrar de auth.refresh_tokens: %', SQLERRM;
    END;

    -- 4. Registro en Auditoría
    INSERT INTO public.audit_logs (user_id, target_user_id, action, details)
    VALUES (auth.uid(), target_user_id, 'PASSWORD_RESET', 'Contraseña cambiada. Intent de cierre de sesión realizado.');
END;
$$;

-- 3. actualizar_pedido_salida
CREATE OR REPLACE FUNCTION public.actualizar_pedido_salida(
    p_pedido_id UUID,
    p_destino TEXT,
    p_bloque_id UUID,
    p_tercero_id UUID,
    p_encargado_id UUID,
    p_solicitante_dni TEXT,
    p_solicitante_nombre TEXT,
    p_items JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item JSONB;
BEGIN
    -- Only allow editing if status is 'Pendiente'
    UPDATE public.pedidos_salida
    SET 
        destino_o_uso = p_destino,
        bloque_id = p_bloque_id,
        tercero_id = p_tercero_id,
        encargado_id = p_encargado_id,
        solicitante_dni = p_solicitante_dni,
        solicitante_nombre = p_solicitante_nombre,
        updated_at = NOW()
    WHERE id = p_pedido_id AND estado = 'Pendiente';

    -- Update Details (Delete and Re-insert is simplest for atomic updates)
    DELETE FROM public.pedidos_salida_detalle WHERE pedido_id = p_pedido_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        INSERT INTO public.pedidos_salida_detalle (
            pedido_id, material_id, equipo_id, epp_id, cantidad_solicitada, cantidad_entregada
        ) VALUES (
            p_pedido_id,
            (v_item->>'material_id')::UUID,
            (v_item->>'equipo_id')::UUID,
            (v_item->>'epp_id')::UUID,
            (v_item->>'cantidad')::NUMERIC,
            0
        );
    END LOOP;
END;
$$;

-- 4. aprobar_pedido_salida
CREATE OR REPLACE FUNCTION public.aprobar_pedido_salida(
    p_pedido_id UUID,
    p_items_entrega JSONB -- [{detalle_id, cantidad_entregada}]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pedido RECORD;
    v_item_entrega JSONB;
    v_detalle RECORD;
    v_stock_actual NUMERIC;
    v_all_full_delivered BOOLEAN := TRUE;
    v_caller_role TEXT;
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

        -- Validate Stock
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
            fecha, destino_o_uso, solicitante, solicitante_dni,
            tercero_id, encargado_id, bloque_id, numero_vale, created_at
        ) VALUES (
            v_pedido.obra_id, 'SALIDA', v_detalle.material_id, v_detalle.equipo_id, v_detalle.epp_id, 
            (v_item_entrega->>'cantidad_entregada')::NUMERIC,
            NOW(), v_pedido.destino_o_uso, v_pedido.solicitante_nombre, v_pedido.solicitante_dni,
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

-- 5. get_peek_vale_salida
CREATE OR REPLACE FUNCTION public.get_peek_vale_salida(p_obra_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INT;
    v_year TEXT;
BEGIN
    v_year := TO_CHAR(NOW(), 'YYYY');

    -- Just get the current value without incrementing
    SELECT value INTO v_count
    FROM public.counters
    WHERE key = 'vale_salida_' || p_obra_id || '_' || v_year;

    -- Return next number (current + 1) or 1 if not exists
    RETURN 'V-' || v_year || '-' || LPAD((COALESCE(v_count, 0) + 1)::TEXT, 4, '0');
END;
$$;

-- 6. crear_pedido_salida
CREATE OR REPLACE FUNCTION public.crear_pedido_salida(
    p_obra_id UUID,
    p_solicitante_dni TEXT,
    p_solicitante_nombre TEXT,
    p_encargado_id UUID,
    p_destino TEXT,
    p_bloque_id UUID,
    p_tercero_id UUID,
    p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pedido_id UUID;
    v_vale_num TEXT;
    v_count INT;
    v_year TEXT;
    v_item JSONB;
BEGIN
    v_year := TO_CHAR(NOW(), 'YYYY');

    -- Atomic generation of voucher number using THE SAME SHARED counter
    INSERT INTO public.counters (key, value)
    VALUES ('vale_salida_' || p_obra_id || '_' || v_year, 1)
    ON CONFLICT (key) DO UPDATE SET value = public.counters.value + 1
    RETURNING value INTO v_count;

    v_vale_num := 'V-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');

    INSERT INTO public.pedidos_salida (
        obra_id, solicitante_dni, solicitante_nombre, encargado_id, numero_vale, estado, destino_o_uso, bloque_id, tercero_id
    ) VALUES (
        p_obra_id, p_solicitante_dni, p_solicitante_nombre, p_encargado_id, v_vale_num, 'Pendiente', p_destino, p_bloque_id, p_tercero_id
    ) RETURNING id INTO v_pedido_id;

    FOR v_item IN SELECT * FROM JSONB_ARRAY_ELEMENTS(p_items)
    LOOP
        INSERT INTO public.pedidos_salida_detalle (
            pedido_id, material_id, equipo_id, epp_id, cantidad_solicitada, cantidad_entregada
        ) VALUES (
            v_pedido_id,
            (v_item->>'material_id')::UUID,
            (v_item->>'equipo_id')::UUID,
            (v_item->>'epp_id')::UUID,
            (v_item->>'cantidad')::NUMERIC,
            0
        );
    END LOOP;

    RETURN JSONB_BUILD_OBJECT('id', v_pedido_id, 'numero_vale', v_vale_num);
END;
$$;

-- 7. registrar_salida_almacen
CREATE OR REPLACE FUNCTION public.registrar_salida_almacen(
    p_tipo TEXT,
    p_item_id UUID,
    p_cantidad NUMERIC,
    p_destino TEXT,
    p_solicitante TEXT,
    p_obra_id UUID,
    p_tercero_id UUID DEFAULT NULL,
    p_encargado_id UUID DEFAULT NULL,
    p_bloque_id UUID DEFAULT NULL,
    p_vale TEXT DEFAULT NULL,
    p_solicitante_dni TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_stock_actual NUMERIC;
BEGIN
    -- 1. Verificar stock
    SELECT cantidad_actual INTO v_stock_actual
    FROM public.inventario_obra
    WHERE obra_id = p_obra_id
      AND (
          (p_tipo = 'MATERIAL' AND material_id = p_item_id) OR
          (p_tipo = 'EQUIPO' AND equipo_id = p_item_id) OR
          (p_tipo = 'EPP' AND epp_id = p_item_id)
      );

    IF v_stock_actual < p_cantidad THEN
        RAISE EXCEPTION 'Stock insuficiente para esta operación';
    END IF;

    -- 2. Insertar movimiento
    INSERT INTO public.movimientos_almacen (
        obra_id, tipo, material_id, equipo_id, epp_id, cantidad, fecha,
        solicitante, solicitante_dni, destino_o_uso, tercero_id, encargado_id, bloque_id, numero_vale
    ) VALUES (
        p_obra_id, 'SALIDA',
        CASE WHEN p_tipo = 'MATERIAL' THEN p_item_id ELSE NULL END,
        CASE WHEN p_tipo = 'EQUIPO' THEN p_item_id ELSE NULL END,
        CASE WHEN p_tipo = 'EPP' THEN p_item_id ELSE NULL END,
        p_cantidad, NOW(),
        p_solicitante, p_solicitante_dni, p_destino, p_tercero_id, p_encargado_id, p_bloque_id, p_vale
    );
END;
$$;

-- 8. anular_pedido_salida
CREATE OR REPLACE FUNCTION public.anular_pedido_salida(p_pedido_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    SET estado = 'Rechazado',
        updated_at = NOW()
    WHERE id = p_pedido_id;
END;
$$;
