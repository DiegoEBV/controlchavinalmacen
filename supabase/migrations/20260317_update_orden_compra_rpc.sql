-- RPC to update an Order Compra and its details atomically
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
    -- 1. Update Header
    UPDATE public.ordenes_compra
    SET
        numero_oc = (p_oc_data->>'numero_oc'),
        proveedor = (p_oc_data->>'proveedor'),
        fecha_oc = (p_oc_data->>'fecha_oc')::date,
        fecha_aproximada_atencion = (p_oc_data->>'fecha_aproximada_atencion')::date,
        n_factura = (p_oc_data->>'n_factura'),
        fecha_vencimiento = (p_oc_data->>'fecha_vencimiento')::date
    WHERE id = p_oc_id;

    -- 2. Delete existing details
    DELETE FROM public.detalles_oc WHERE oc_id = p_oc_id;

    -- 3. Insert new details
    INSERT INTO public.detalles_oc (oc_id, detalle_sc_id, cantidad, precio_unitario)
    SELECT
        p_oc_id,
        (item->>'detalle_sc_id')::uuid,
        (item->>'cantidad')::numeric,
        (item->>'precio_unitario')::numeric
    FROM jsonb_array_elements(p_items) AS item;

END;
$$;
