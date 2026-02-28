-- Script to restrict overly permissive RLS policies
-- We will restrict INSERT, UPDATE, and DELETE operations to authenticated users only.
-- SELECT operations will remain public (USING true) if they were already public, 
-- or restricted to authenticated if that's more appropriate.

-- 1. Table: categorias
DROP POLICY IF EXISTS "Permitir todo a todos" ON public.categorias;
CREATE POLICY "Enable read access for all users" ON public.categorias FOR SELECT USING (true);
CREATE POLICY "Enable write access for authenticated users" ON public.categorias FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 2. Table: detalles_oc
DROP POLICY IF EXISTS "Permitir todo a detalles_oc" ON public.detalles_oc;
CREATE POLICY "Enable read access for all users" ON public.detalles_oc FOR SELECT USING (true);
CREATE POLICY "Enable write access for authenticated users" ON public.detalles_oc FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Table: detalles_requerimiento
DROP POLICY IF EXISTS "Acceso total detalles" ON public.detalles_requerimiento;
DROP POLICY IF EXISTS "Allow authenticated insert access" ON public.detalles_requerimiento;
DROP POLICY IF EXISTS "Allow authenticated update access" ON public.detalles_requerimiento;
CREATE POLICY "Enable read access for all users" ON public.detalles_requerimiento FOR SELECT USING (true);
CREATE POLICY "Enable write access for authenticated users" ON public.detalles_requerimiento FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 4. Table: detalles_sc
DROP POLICY IF EXISTS "Permitir todo a detalles_sc" ON public.detalles_sc;
CREATE POLICY "Enable read access for all users" ON public.detalles_sc FOR SELECT USING (true);
CREATE POLICY "Enable write access for authenticated users" ON public.detalles_sc FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 5. Table: equipos
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.equipos;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.equipos;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.equipos;
CREATE POLICY "Enable read access for all users" ON public.equipos FOR SELECT USING (true);
CREATE POLICY "Enable write access for authenticated users" ON public.equipos FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 6. Table: front_specialties
DROP POLICY IF EXISTS "Allow insert/update/delete for authenticated users" ON public.front_specialties;
CREATE POLICY "Enable read access for all users" ON public.front_specialties FOR SELECT USING (true);
CREATE POLICY "Enable write access for authenticated users" ON public.front_specialties FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 7. Table: inventario_obra
DROP POLICY IF EXISTS "Public setup" ON public.inventario_obra;
CREATE POLICY "Enable read access for all users" ON public.inventario_obra FOR SELECT USING (true);
CREATE POLICY "Enable write access for authenticated users" ON public.inventario_obra FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 8. Table: listinsumo_especialidad
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.listinsumo_especialidad;
CREATE POLICY "Enable read access for all users" ON public.listinsumo_especialidad FOR SELECT USING (true);
CREATE POLICY "Enable write access for authenticated users" ON public.listinsumo_especialidad FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 9. Table: materiales
DROP POLICY IF EXISTS "Acceso total materiales" ON public.materiales;
CREATE POLICY "Enable read access for all users" ON public.materiales FOR SELECT USING (true);
CREATE POLICY "Enable write access for authenticated users" ON public.materiales FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 10. Table: movimientos_almacen
DROP POLICY IF EXISTS "Public setup" ON public.movimientos_almacen;
CREATE POLICY "Enable read access for all users" ON public.movimientos_almacen FOR SELECT USING (true);
CREATE POLICY "Enable write access for authenticated users" ON public.movimientos_almacen FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 11. Table: movimientos_equipos
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.movimientos_equipos;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.movimientos_equipos;
CREATE POLICY "Enable read access for all users" ON public.movimientos_equipos FOR SELECT USING (true);
CREATE POLICY "Enable write access for authenticated users" ON public.movimientos_equipos FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 12. Table: obras
DROP POLICY IF EXISTS "Acceso total obras" ON public.obras;
CREATE POLICY "Enable read access for all users" ON public.obras FOR SELECT USING (true);
CREATE POLICY "Enable write access for authenticated users" ON public.obras FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 13. Table: ordenes_compra
DROP POLICY IF EXISTS "Permitir todo a ordenes_compra" ON public.ordenes_compra;
CREATE POLICY "Enable read access for all users" ON public.ordenes_compra FOR SELECT USING (true);
CREATE POLICY "Enable write access for authenticated users" ON public.ordenes_compra FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 14. Table: requerimientos
DROP POLICY IF EXISTS "Acceso total requerimientos" ON public.requerimientos;
DROP POLICY IF EXISTS "Allow authenticated insert access" ON public.requerimientos;
DROP POLICY IF EXISTS "Allow authenticated update access" ON public.requerimientos;
CREATE POLICY "Enable read access for all users" ON public.requerimientos FOR SELECT USING (true);
CREATE POLICY "Enable write access for authenticated users" ON public.requerimientos FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 15. Table: solicitantes
DROP POLICY IF EXISTS "Permitir todo a todos" ON public.solicitantes;
CREATE POLICY "Enable read access for all users" ON public.solicitantes FOR SELECT USING (true);
CREATE POLICY "Enable write access for authenticated users" ON public.solicitantes FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 16. Table: solicitudes_compra
DROP POLICY IF EXISTS "Permitir todo a solicitudes_compra" ON public.solicitudes_compra;
CREATE POLICY "Enable read access for all users" ON public.solicitudes_compra FOR SELECT USING (true);
CREATE POLICY "Enable write access for authenticated users" ON public.solicitudes_compra FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 17. Table: specialties
DROP POLICY IF EXISTS "Allow insert/update/delete for authenticated users" ON public.specialties;
CREATE POLICY "Enable read access for all users" ON public.specialties FOR SELECT USING (true);
CREATE POLICY "Enable write access for authenticated users" ON public.specialties FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
