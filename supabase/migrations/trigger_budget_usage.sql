-- 1. Create or Replace the trigger function to update material budget using listinsumo_id
CREATE OR REPLACE FUNCTION public.update_material_budget_usage()
RETURNS TRIGGER AS $$
DECLARE
    v_listinsumo_id UUID;
    v_tipo_movimiento TEXT;
BEGIN
    -- Obtenemos el listinsumo_id desde el detalle del requerimiento asociado al movimiento
    -- IMPORTANTE: Para que esto funcione, el movimiento de ENTRADA debe tener el 'detalle_requerimiento_id' o 'requerimiento_id' guardado.
    SELECT listinsumo_id INTO v_listinsumo_id
    FROM public.detalles_requerimiento
    WHERE id = NEW.detalle_requerimiento_id;

    -- Solo actualizamos si el material estaba vinculado a una línea de presupuesto (listinsumo_id IS NOT NULL)
    IF v_listinsumo_id IS NOT NULL THEN
        -- El usuario especificó que se descuente al hacer el INGRESO (ENTRADA) a almacén
        IF (TG_OP = 'INSERT' AND NEW.tipo = 'ENTRADA') THEN
            UPDATE public.listinsumo_especialidad
            SET cantidad_utilizada = cantidad_utilizada + NEW.cantidad
            WHERE id = v_listinsumo_id;
        ELSIF (TG_OP = 'DELETE' AND OLD.tipo = 'ENTRADA') THEN
            UPDATE public.listinsumo_especialidad
            SET cantidad_utilizada = cantidad_utilizada - OLD.cantidad
            WHERE id = v_listinsumo_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Drop the existing trigger if it exists
DROP TRIGGER IF EXISTS trg_update_budget_usage ON public.movimientos_almacen;

-- 3. Create the trigger on movimientos_almacen
CREATE TRIGGER trg_update_budget_usage
AFTER INSERT OR DELETE ON public.movimientos_almacen
FOR EACH ROW
EXECUTE FUNCTION public.update_material_budget_usage();
