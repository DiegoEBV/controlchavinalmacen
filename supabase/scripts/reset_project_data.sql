-- ⚠️ DANGER: This script deletes ALL transactional data (Requirements, Purchases, Inventory).
-- Use with caution.

BEGIN;

-- 1. Truncate tables (CASCADE handles dependent tables automatically)
-- We list the main parent tables, and CASCADE will clean up the children (details, etc.)
TRUNCATE TABLE 
    movimientos_almacen,
    inventario_obra,
    ordenes_compra,
    solicitudes_compra,
    requerimientos
RESTART IDENTITY CASCADE;

-- 2. Reset Sequence for Correlative (if it exists)
-- This assumes standard naming convention. If your sequence is named differently, update this.
-- Try to reset the sequence associated with requerimientos.item_correlativo
DO $$
DECLARE
    seq_name TEXT := 'requerimientos_item_correlativo_seq';
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = seq_name) THEN
        EXECUTE 'ALTER SEQUENCE ' || seq_name || ' RESTART WITH 1';
    END IF;
END $$;

COMMIT;
