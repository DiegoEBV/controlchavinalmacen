-- ========================================================================
-- MIGRATION: Fix RLS on cierres_mensuales and cierres_mensuales_detalle
-- Enables RLS and creates specific, non-permissive policies for authenticated users
-- ========================================================================

-- Enable RLS
ALTER TABLE public.cierres_mensuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cierres_mensuales_detalle ENABLE ROW LEVEL SECURITY;

-- Policies for cierres_mensuales
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.cierres_mensuales;

CREATE POLICY "Enable read access for authenticated users" ON public.cierres_mensuales
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Enable insert access for authenticated users" ON public.cierres_mensuales
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Enable update access for authenticated users" ON public.cierres_mensuales
    FOR UPDATE
    TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Enable delete access for authenticated users" ON public.cierres_mensuales
    FOR DELETE
    TO authenticated
    USING (auth.uid() IS NOT NULL);

-- Policies for cierres_mensuales_detalle
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.cierres_mensuales_detalle;

CREATE POLICY "Enable read access for authenticated users" ON public.cierres_mensuales_detalle
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Enable insert access for authenticated users" ON public.cierres_mensuales_detalle
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Enable update access for authenticated users" ON public.cierres_mensuales_detalle
    FOR UPDATE
    TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Enable delete access for authenticated users" ON public.cierres_mensuales_detalle
    FOR DELETE
    TO authenticated
    USING (auth.uid() IS NOT NULL);
