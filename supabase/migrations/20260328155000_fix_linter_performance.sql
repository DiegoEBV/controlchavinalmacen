-- Migration to fix Supabase Performance Linter Warnings
-- Created: 2026-03-28
-- Description: Adds missing indexes to foreign keys and removes unused indexes.

-- 1. [Audit & Notifications]
CREATE INDEX IF NOT EXISTS ix_audit_logs_target_user_id ON public.audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS ix_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS ix_notifications_user_id ON public.notifications(user_id);

-- 2. [Project Structure]
CREATE INDEX IF NOT EXISTS ix_obras_parent_id ON public.obras(parent_id);
CREATE INDEX IF NOT EXISTS ix_frentes_obra_id ON public.frentes(obra_id);
CREATE INDEX IF NOT EXISTS ix_bloques_frente_id ON public.bloques(frente_id);
CREATE INDEX IF NOT EXISTS ix_usuario_obras_obra_id ON public.usuario_obras(obra_id);

-- 3. [Requirements & solicitudes_compra]
CREATE INDEX IF NOT EXISTS ix_requerimientos_frente_id ON public.requerimientos(frente_id);
CREATE INDEX IF NOT EXISTS ix_requerimientos_specialty_id ON public.requerimientos(specialty_id);
CREATE INDEX IF NOT EXISTS ix_detalles_requerimiento_equipo_id ON public.detalles_requerimiento(equipo_id);
CREATE INDEX IF NOT EXISTS ix_detalles_requerimiento_epp_id ON public.detalles_requerimiento(epp_id);
CREATE INDEX IF NOT EXISTS ix_detalles_requerimiento_material_id ON public.detalles_requerimiento(material_id);
CREATE INDEX IF NOT EXISTS ix_detalles_requerimiento_listinsumo_id ON public.detalles_requerimiento(listinsumo_id);
CREATE INDEX IF NOT EXISTS ix_solicitudes_compra_requerimiento_id ON public.solicitudes_compra(requerimiento_id);

-- 4. [detalles_sc & ordenes_compra]
CREATE INDEX IF NOT EXISTS ix_detalles_sc_sc_id ON public.detalles_sc(sc_id);
CREATE INDEX IF NOT EXISTS ix_detalles_sc_material_id ON public.detalles_sc(material_id);
CREATE INDEX IF NOT EXISTS ix_detalles_sc_equipo_id ON public.detalles_sc(equipo_id);
CREATE INDEX IF NOT EXISTS ix_detalles_sc_epp_id ON public.detalles_sc(epp_id);
CREATE INDEX IF NOT EXISTS ix_detalles_sc_detalle_requerimiento_id ON public.detalles_sc(detalle_requerimiento_id);
CREATE INDEX IF NOT EXISTS ix_ordenes_compra_sc_id ON public.ordenes_compra(sc_id);
CREATE INDEX IF NOT EXISTS ix_detalles_oc_oc_id ON public.detalles_oc(oc_id);
CREATE INDEX IF NOT EXISTS ix_detalles_oc_detalle_sc_id ON public.detalles_oc(detalle_sc_id);

-- 5. [Inventory & Movements]
CREATE INDEX IF NOT EXISTS ix_inventario_obra_material_id ON public.inventario_obra(material_id);
CREATE INDEX IF NOT EXISTS ix_inventario_obra_equipo_id ON public.inventario_obra(equipo_id);
CREATE INDEX IF NOT EXISTS ix_inventario_obra_epp_id ON public.inventario_obra(epp_id);

CREATE INDEX IF NOT EXISTS ix_movimientos_almacen_material_id ON public.movimientos_almacen(material_id);
CREATE INDEX IF NOT EXISTS ix_movimientos_almacen_requerimiento_id ON public.movimientos_almacen(requerimiento_id);
CREATE INDEX IF NOT EXISTS ix_movimientos_almacen_detalle_requerimiento_id ON public.movimientos_almacen(detalle_requerimiento_id);
CREATE INDEX IF NOT EXISTS ix_movimientos_almacen_tercero_id ON public.movimientos_almacen(tercero_id);
CREATE INDEX IF NOT EXISTS ix_movimientos_almacen_encargado_id ON public.movimientos_almacen(encargado_id);
CREATE INDEX IF NOT EXISTS ix_movimientos_almacen_bloque_id ON public.movimientos_almacen(bloque_id);
CREATE INDEX IF NOT EXISTS ix_movimientos_almacen_equipo_id ON public.movimientos_almacen(equipo_id);
CREATE INDEX IF NOT EXISTS ix_movimientos_almacen_epp_id ON public.movimientos_almacen(epp_id);
CREATE INDEX IF NOT EXISTS ix_movimientos_almacen_detalle_sc_id ON public.movimientos_almacen(detalle_sc_id);
CREATE INDEX IF NOT EXISTS ix_movimientos_almacen_orden_compra_id ON public.movimientos_almacen(orden_compra_id);

CREATE INDEX IF NOT EXISTS ix_movimientos_equipos_solicitante_id ON public.movimientos_equipos(solicitante_id);
CREATE INDEX IF NOT EXISTS ix_movimientos_equipos_usuario_autoriza_id ON public.movimientos_equipos(usuario_autoriza_id);
CREATE INDEX IF NOT EXISTS ix_movimientos_equipos_encargado_id ON public.movimientos_equipos(encargado_id);

CREATE INDEX IF NOT EXISTS ix_pedidos_salida_encargado_id ON public.pedidos_salida(encargado_id);
CREATE INDEX IF NOT EXISTS ix_pedidos_salida_bloque_id ON public.pedidos_salida(bloque_id);
CREATE INDEX IF NOT EXISTS ix_pedidos_salida_tercero_id ON public.pedidos_salida(tercero_id);

CREATE INDEX IF NOT EXISTS ix_pedidos_salida_detalle_pedido_id ON public.pedidos_salida_detalle(pedido_id);
CREATE INDEX IF NOT EXISTS ix_pedidos_salida_detalle_material_id ON public.pedidos_salida_detalle(material_id);
CREATE INDEX IF NOT EXISTS ix_pedidos_salida_detalle_equipo_id ON public.pedidos_salida_detalle(equipo_id);
CREATE INDEX IF NOT EXISTS ix_pedidos_salida_detalle_epp_id ON public.pedidos_salida_detalle(epp_id);

-- 6. [Devoluciones]
CREATE INDEX IF NOT EXISTS ix_devoluciones_material_salida_id ON public.devoluciones(material_salida_id);
CREATE INDEX IF NOT EXISTS ix_devoluciones_equipo_salida_id ON public.devoluciones(equipo_salida_id);
CREATE INDEX IF NOT EXISTS ix_devoluciones_epp_salida_id ON public.devoluciones(epp_salida_id);
CREATE INDEX IF NOT EXISTS ix_devoluciones_material_entrada_id ON public.devoluciones(material_entrada_id);
CREATE INDEX IF NOT EXISTS ix_devoluciones_equipo_entrada_id ON public.devoluciones(equipo_entrada_id);
CREATE INDEX IF NOT EXISTS ix_devoluciones_epp_entrada_id ON public.devoluciones(epp_entrada_id);
CREATE INDEX IF NOT EXISTS ix_devoluciones_usuario_id ON public.devoluciones(usuario_id);

-- 7. [Monthly Closures & History]
CREATE INDEX IF NOT EXISTS ix_cierres_mensuales_detalle_material_id ON public.cierres_mensuales_detalle(material_id);
CREATE INDEX IF NOT EXISTS ix_cierres_mensuales_detalle_equipo_id ON public.cierres_mensuales_detalle(equipo_id);
CREATE INDEX IF NOT EXISTS ix_cierres_mensuales_detalle_epp_id ON public.cierres_mensuales_detalle(epp_id);

CREATE INDEX IF NOT EXISTS ix_historial_costos_equipo_id ON public.historial_costos(equipo_id);
CREATE INDEX IF NOT EXISTS ix_historial_costos_epp_id ON public.historial_costos(epp_id);

-- Indices for all monthly cierre tables (2026_01 to 2026_12)
DO $$ 
DECLARE 
    t TEXT;
BEGIN
    FOR i IN 1..12 LOOP
        t := format('cierre_valorizado_2026_%s', LPAD(i::TEXT, 2, '0'));
        -- Check if table exists before creating index
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t AND table_schema = 'public') THEN
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(obra_id);', 'ix_' || t || '_obra_id', t);
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(material_id);', 'ix_' || t || '_material_id', t);
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(equipo_id);', 'ix_' || t || '_equipo_id', t);
            EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(epp_id);', 'ix_' || t || '_epp_id', t);
        END IF;
    END LOOP;
END $$;

-- 8. [Specialties]
CREATE INDEX IF NOT EXISTS ix_front_specialties_specialty_id ON public.front_specialties(specialty_id);
-- In listinsumo_especialidad, the column is actually indexable by column position in metadata (3), which is material_id
CREATE INDEX IF NOT EXISTS ix_listinsumo_especialidad_material_id ON public.listinsumo_especialidad(material_id);
