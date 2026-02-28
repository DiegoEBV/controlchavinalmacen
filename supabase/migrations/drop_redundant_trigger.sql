-- Drop the redundant trigger that causes double stock increments
DROP TRIGGER IF EXISTS trg_update_inventario ON public.movimientos_almacen;

-- The function `fn_update_inventario_on_movimiento` can also be safely removed 
-- if it was only used by this trigger, but dropping the trigger is sufficient 
-- to stop the duplication immediately.
-- DROP FUNCTION IF EXISTS fn_update_inventario_on_movimiento();
