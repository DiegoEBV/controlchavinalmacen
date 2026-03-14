-- Script to enable and configure RLS for Pedidos de Salida
-- This allows authenticated users to read and write to the pedidos tables

-- 1. Enable RLS on both tables (in case it's not already enabled)
ALTER TABLE public.pedidos_salida ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_salida_detalle ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Enable read access for all users" ON public.pedidos_salida;
DROP POLICY IF EXISTS "Enable write access for authenticated users" ON public.pedidos_salida;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.pedidos_salida_detalle;
DROP POLICY IF EXISTS "Enable write access for authenticated users" ON public.pedidos_salida_detalle;

-- 3. Create permissive policies for 'pedidos_salida'
CREATE POLICY "Enable read access for all users" 
ON public.pedidos_salida FOR SELECT 
USING (true);

CREATE POLICY "Enable write access for authenticated users" 
ON public.pedidos_salida FOR ALL 
TO authenticated 
USING (auth.uid() IS NOT NULL) 
WITH CHECK (auth.uid() IS NOT NULL);

-- 4. Create permissive policies for 'pedidos_salida_detalle'
CREATE POLICY "Enable read access for all users" 
ON public.pedidos_salida_detalle FOR SELECT 
USING (true);

CREATE POLICY "Enable write access for authenticated users" 
ON public.pedidos_salida_detalle FOR ALL 
TO authenticated 
USING (auth.uid() IS NOT NULL) 
WITH CHECK (auth.uid() IS NOT NULL);

-- Note: The RPCs (crear_pedido_salida, actualizar, anular) already run with SECURITY DEFINER,
-- which bypasses RLS, but these policies are strictly necessary for the frontend 
-- to SELECT and view the records in the tables via getPedidosSalida().
