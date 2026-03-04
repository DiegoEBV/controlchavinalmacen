-- Migration: Add Hybrid SC support
-- 1. Add columns to detalles_sc
ALTER TABLE public.detalles_sc 
ADD COLUMN IF NOT EXISTS enviar_a_oc BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS procesado_directo BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS detalle_requerimiento_id UUID REFERENCES public.detalles_requerimiento(id) ON DELETE SET NULL;

-- 2. Create RPC function for hybrid processing
CREATE OR REPLACE FUNCTION public.procesar_sc_hibrida(p_sc_id UUID) 
RETURNS VOID AS $$
DECLARE
    item RECORD;
BEGIN
    -- Seguridad: Solo permitir ejecución a usuarios autenticados
    IF auth.role() <> 'authenticated' THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    FOR item IN 
        SELECT id, detalle_requerimiento_id, cantidad, enviar_a_oc 
        FROM public.detalles_sc
        WHERE sc_id = p_sc_id
    LOOP
        IF item.enviar_a_oc = FALSE THEN
            -- 1. Actualizar Requerimiento (Usando COALESCE)
            UPDATE public.detalles_requerimiento
            SET cantidad_atendida = COALESCE(cantidad_atendida, 0) + item.cantidad,
                estado = CASE 
                    WHEN (COALESCE(cantidad_atendida, 0) + item.cantidad) >= cantidad_solicitada THEN 'Atendido'
                    ELSE 'Parcial'
                END
            WHERE id = item.detalle_requerimiento_id;
            
            -- 2. Marcar ítem de SC como procesado
            UPDATE public.detalles_sc
            SET estado = 'Atendido',
                procesado_directo = TRUE
            WHERE id = item.id;
        END IF;
    END LOOP;

    -- 3. Si todos los ítems son Skip OC, marcar cabecera SC como Atendida
    IF NOT EXISTS (SELECT 1 FROM public.detalles_sc WHERE sc_id = p_sc_id AND enviar_a_oc = TRUE) THEN
        UPDATE public.solicitudes_compra SET estado = 'Atendida' WHERE id = p_sc_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
