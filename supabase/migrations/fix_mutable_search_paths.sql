DO $$
DECLARE
    rec RECORD;
    alter_stmt TEXT;
BEGIN
    FOR rec IN 
        SELECT p.proname AS function_name, pg_get_function_identity_arguments(p.oid) AS args
        FROM   pg_proc p
        JOIN   pg_namespace n ON n.oid = p.pronamespace
        WHERE  n.nspname = 'public' 
        AND    p.proname IN (
            'handle_equipo_retorno',
            'handle_new_user',
            'set_epp_code',
            'ajustar_inventario_stock',
            'handle_equipo_salida',
            'set_correlativo_obra',
            'admin_update_user_password',
            'registrar_entrada_caja_chica',
            'actualizar_requerimiento_completo',
            'update_material_budget_usage',
            'adjust_inventory',
            'registrar_entrada_almacen',
            'crear_requerimiento_completo',
            'registrar_entrada_masiva'
        )
    LOOP
        -- Reverting to public search path 
        alter_stmt := format('ALTER FUNCTION public.%I(%s) SET search_path = public;', rec.function_name, rec.args);
        EXECUTE alter_stmt;
        RAISE NOTICE 'Executed: %', alter_stmt;
    END LOOP;
END
$$;
