-- Migration: RPC to get next Salida Vale Number
CREATE OR REPLACE FUNCTION public.get_next_vale_salida(p_obra_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
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
