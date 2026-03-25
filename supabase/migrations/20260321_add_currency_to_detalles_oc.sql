-- 1. Añadir columnas de moneda y tipo de cambio a la tabla de DETALLES de orden de compra
ALTER TABLE public.detalles_oc 
ADD COLUMN moneda text DEFAULT 'MN',
ADD COLUMN tipo_cambio numeric DEFAULT 1;

-- 2. Actualizar la función de edición (RPC) para que guarde estos nuevos campos por cada item
CREATE OR REPLACE FUNCTION public.update_orden_compra(
    p_oc_id uuid,
    p_oc_data jsonb,
    p_items jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 1. Actualizar Cabecera (General)
    UPDATE public.ordenes_compra
    SET
        numero_oc = (p_oc_data->>'numero_oc'),
        proveedor = (p_oc_data->>'proveedor'),
        fecha_oc = (p_oc_data->>'fecha_oc')::date,
        fecha_aproximada_atencion = (p_oc_data->>'fecha_aproximada_atencion')::date,
        n_factura = (p_oc_data->>'n_factura'),
        fecha_vencimiento = (p_oc_data->>'fecha_vencimiento')::date
    WHERE id = p_oc_id;

    -- 2. Eliminar detalles existentes
    DELETE FROM public.detalles_oc WHERE oc_id = p_oc_id;

    -- 3. Insertar nuevos detalles incluyendo moneda y tipo de cambio por fila
    INSERT INTO public.detalles_oc (oc_id, detalle_sc_id, cantidad, precio_unitario, moneda, tipo_cambio)
    SELECT
        p_oc_id,
        (item->>'detalle_sc_id')::uuid,
        (item->>'cantidad')::numeric,
        (item->>'precio_unitario')::numeric,
        COALESCE(item->>'moneda', 'MN'),
        COALESCE((item->>'tipo_cambio')::numeric, 1)
    FROM jsonb_array_elements(p_items) AS item;

END;
$$;
